import { describe, it, expect } from "vitest";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderSample } from "./__fixtures__/sample";

/** Every .ts / .tsx file under `dir` that is not a test or a fixture. */
function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "__fixtures__" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...productionSources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("synthetic imagery stays out of the production bundle", () => {
  it("no worker, shared or client module imports the pdf fixtures", () => {
    const root = join(import.meta.dirname, "..", "..", "..");
    const offenders: string[] = [];
    for (const base of ["worker", "shared", "client/src"]) {
      for (const file of productionSources(join(root, base))) {
        const src = readFileSync(file, "utf8");
        // Import or re-export of a fixture module, or use of the synthetic photo constant.
        if (/(?:from|import)\s*\(?\s*["'][^"']*(?:__fixtures__|samplePhoto)|SAMPLE_PHOTO_JPEG_B64/.test(src)) offenders.push(relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

const OUT =
  process.env.PDF_SAMPLE_OUT ??
  "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad/pdf-sample.pdf";

describe("sample showcase", () => {
  it("renders every block into a multi-page PDF and writes it for review", async () => {
    const started = Date.now();
    const bytes = await renderSample();
    const elapsed = Date.now() - started;
    expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
    expect(elapsed).toBeLessThan(4000);
    try {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, bytes);
      console.log(`sample PDF: ${OUT} (${pdf.getPageCount()} pages, ${bytes.length} bytes, ${elapsed} ms)`);
    } catch (err) {
      console.warn(`could not write sample PDF to ${OUT}:`, err);
    }
  });
});
