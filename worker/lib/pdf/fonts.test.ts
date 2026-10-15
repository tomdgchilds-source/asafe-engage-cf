import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { createDoc, addPage, finalize, type DocMeta } from "./doc";
import { heading, body, label, bullets, sanitizeFor, measure } from "./text";
import { BRAND_FONT_KEYS, resetBrandFontCache, isBrandFont, type FontEnv } from "./fonts";

// The TTFs are not in git. Point INTER_TTF_DIR at a directory holding
// Inter-Regular / SemiBold / Bold.ttf (see scripts/uploadBrandFonts.ts);
// the default is where this session extracted the v4.1 release.
const TTF_DIR =
  process.env.INTER_TTF_DIR ??
  "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad/inter-fonts";
const haveTtfs = ["Inter-Regular.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf"].every((f) => existsSync(join(TTF_DIR, f)));

const meta: DocMeta = {
  title: "Impact Protection Risk Assessment",
  reference: "ASU-RA-2610-0042",
  revision: "A",
  issuedOn: "15 Oct 2026",
  docType: "Impact Protection Risk Assessment",
  status: "ISSUED",
};

/** An R2-shaped env that serves the local TTFs by their brand/fonts/… key. */
function ttfEnv(): FontEnv & { calls: string[] } {
  const calls: string[] = [];
  const byKey = new Map<string, Uint8Array>(
    (Object.values(BRAND_FONT_KEYS) as string[]).map((key) => [key, readFileSync(join(TTF_DIR, key.split("/").pop()!))]),
  );
  const bucket = {
    async get(key: string) {
      calls.push(key);
      const bytes = byKey.get(key);
      if (!bytes) return null;
      return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    },
  };
  return { R2_BUCKET: bucket as unknown as R2Bucket, FILES_STORE: undefined as unknown as KVNamespace, calls };
}

function failingEnv(): FontEnv {
  const bucket = {
    async get() {
      throw new Error("R2 unavailable");
    },
  };
  return { R2_BUCKET: bucket as unknown as R2Bucket, FILES_STORE: undefined as unknown as KVNamespace };
}

/** BaseFont names of every font dictionary in the saved PDF (object streams included). */
async function baseFontNames(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const base = obj.get(PDFName.of("BaseFont"));
    if (base instanceof PDFName) names.push(base.decodeText());
  }
  return names;
}

/** A few pages of representative copy so the size comparison is meaningful. */
function fillSampleContent(doc: Awaited<ReturnType<typeof createDoc>>): void {
  const page = addPage(doc);
  heading(page, 1, "Executive summary");
  label(doc.current!, "Prepared for");
  body(doc.current!, "Al Quoz Distribution Centre — Dubai Industrial City, United Arab Emirates.");
  for (let i = 0; i < 6; i++) {
    heading(doc.current!, 2, `Area ${i + 1} · Loading dock ${String.fromCharCode(65 + i)}`);
    body(
      doc.current!,
      "Forklift traffic crosses the pedestrian route at the dock apron without physical segregation. Impact loads of ≥ 10 kN are credible at 8 km/h; the existing steel barrier is bent at two posts and anchored into cracked concrete → replace with a polymer barrier rated for the observed vehicle class.",
    );
    bullets(doc.current!, ["iFlex Double Traffic Barrier+ 1.2 m", "Pedestrian Barrier 1.1 m with handrail", "Column Guard 500 mm at rack ends"]);
  }
}

describe("brand fonts", () => {
  beforeEach(() => resetBrandFontCache());
  afterEach(() => {
    resetBrandFontCache();
    vi.restoreAllMocks();
  });

  it("falls back to Helvetica without an env", async () => {
    const doc = await createDoc(meta);
    expect(doc.fonts.brand).toBe(false);
    expect(doc.fonts.regular.name).toBe("Helvetica");
    expect(doc.fonts.bold.name).toBe("Helvetica-Bold");
    expect(doc.fonts.semibold.name).toBe("Helvetica-Bold");
    expect(isBrandFont(doc.fonts.regular)).toBe(false);
  });

  it("falls back to Helvetica with a console.warn when R2 fails, and does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = await createDoc(meta, failingEnv());
    expect(doc.fonts.brand).toBe(false);
    expect(doc.fonts.regular.name).toBe("Helvetica");
    expect(warn).toHaveBeenCalled();
    addPage(doc);
    body(doc.current!, "Résumé ≥ 10 kN ✔");
    const bytes = await finalize(doc);
    expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const names = await baseFontNames(bytes);
    expect(names.some((n) => n.includes("Helvetica"))).toBe(true);
    expect(names.some((n) => n.includes("Inter"))).toBe(false);
  });

  it.skipIf(!haveTtfs)("embeds Inter Regular / SemiBold / Bold from R2 and names them in the PDF", async () => {
    const env = ttfEnv();
    const doc = await createDoc(meta, env);
    expect(doc.fonts.brand).toBe(true);
    expect(doc.fonts.regular.name).toContain("Inter");
    expect(doc.fonts.semibold.name).toContain("SemiBold");
    expect(doc.fonts.bold.name).toContain("Bold");
    expect(isBrandFont(doc.fonts.regular)).toBe(true);
    fillSampleContent(doc);
    const bytes = await finalize(doc);
    const names = await baseFontNames(bytes);
    expect(names.some((n) => n.includes("Inter-Regular"))).toBe(true);
    expect(names.some((n) => n.includes("Inter-SemiBold"))).toBe(true);
    expect(names.some((n) => n.includes("Inter-Bold"))).toBe(true);
    expect(names.some((n) => n.includes("Helvetica"))).toBe(false);
    // Subset embedding: three 410 KB faces must not add 1.2 MB to the file.
    expect(bytes.length).toBeLessThan(250_000);
  });

  it.skipIf(!haveTtfs)("fetches the TTFs once per isolate", async () => {
    const env = ttfEnv();
    await createDoc(meta, env);
    await createDoc(meta, env);
    expect(env.calls.length).toBe(3);
  });

  it.skipIf(!haveTtfs)("keeps Unicode Inter covers and only substitutes what it lacks", async () => {
    const doc = await createDoc(meta, ttfEnv());
    const inter = doc.fonts.regular;
    expect(sanitizeFor(inter, "≥ 10 kN → Crème brûlée Ωλ ✓")).toBe("≥ 10 kN → Crème brûlée Ωλ ✓");
    expect(sanitizeFor(inter, "✔ done ✘ not")).toBe("Yes done No not");
    expect(measure(inter, 9.5, "Ωλ ≥ 10")).toBeGreaterThan(0);
    const plain = await createDoc(meta);
    expect(sanitizeFor(plain.fonts.regular, "≥ 10 kN → Ωλ")).toBe(">= 10 kN -> ??");
    addPage(doc);
    body(doc.current!, "≥ 10 kN → Crème brûlée Ωλ ✓ ✔");
    await expect(finalize(doc)).resolves.toBeInstanceOf(Uint8Array);
  });

  it.skipIf(!haveTtfs)("reports the size delta of the same document in Helvetica and Inter", async () => {
    const helv = await createDoc(meta);
    fillSampleContent(helv);
    const t0 = Date.now();
    const helvBytes = await finalize(helv);
    const helvMs = Date.now() - t0;
    const inter = await createDoc(meta, ttfEnv());
    fillSampleContent(inter);
    const t1 = Date.now();
    const interBytes = await finalize(inter);
    const interMs = Date.now() - t1;
    console.log(
      `font size delta: Helvetica ${helvBytes.length} B (${helv.pages.length} pp, ${helvMs} ms) → Inter ${interBytes.length} B (${inter.pages.length} pp, ${interMs} ms), +${interBytes.length - helvBytes.length} B`,
    );
    expect(interBytes.length).toBeGreaterThan(helvBytes.length);
    expect(interBytes.length - helvBytes.length).toBeLessThan(200_000);
  });
});
