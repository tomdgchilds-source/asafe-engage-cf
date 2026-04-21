/**
 * Merges the 4 impact-verification chunk files into a single report +
 * a machine-applyable patch file.
 *
 * Inputs:
 *   scripts/data/impact-verification-chunk-{1..4}.json
 *
 * Outputs:
 *   scripts/data/impact-verification-report.json  — merged, summary
 *   scripts/data/impact-verification-patch.json   — ready-to-apply
 *                                                     corrections only
 *   scripts/data/impact-verification-summary.md   — human review
 *
 * The patch file is the input to the /api/admin/apply-impact-corrections
 * worker endpoint (added in a sibling commit).
 *
 * Usage:
 *   npx tsx scripts/mergeImpactVerification.ts
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";

interface ChunkProduct {
  familyName: string;
  productUrl: string;
  status:
    | "ok"
    | "mismatch"
    | "catalog_missing"
    | "live_missing"
    | "both_missing"
    | "fetch_failed";
  catalog: {
    impactRating?: number | null;
    impactRatingRaw?: string | null;
    vehicleTest?: string | null;
    pas13Method?: string | null;
    pas13Certified?: boolean | null;
  };
  live: {
    impactRating?: number | null;
    impactRatingRaw?: string | null;
    vehicleTest?: string | null;
    pas13Method?: string | null;
    pas13Certified?: boolean | null;
    deflectionZoneMm?: number | null;
    heightMm?: number | null;
    performanceClass?: string | null;
  };
  notes?: string;
}

interface ChunkFile {
  chunk: number;
  generatedAt: string;
  summary: Record<string, number>;
  products: ChunkProduct[];
}

async function fileExists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const chunks: ChunkFile[] = [];
  const missing: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const path = resolve(`scripts/data/impact-verification-chunk-${i}.json`);
    if (!(await fileExists(path))) {
      missing.push(path);
      continue;
    }
    const raw = await readFile(path, "utf8");
    chunks.push(JSON.parse(raw) as ChunkFile);
  }

  if (missing.length > 0) {
    console.warn(
      `Missing chunks (${missing.length}): ${missing.map((p) => p.split("/").pop()).join(", ")}`,
    );
  }

  const allProducts = chunks.flatMap((c) => c.products);
  console.log(`Merged ${chunks.length} chunk(s), ${allProducts.length} products`);

  const summary: Record<string, number> = {
    total: allProducts.length,
    ok: 0,
    mismatch: 0,
    catalog_missing: 0,
    live_missing: 0,
    both_missing: 0,
    fetch_failed: 0,
  };
  for (const p of allProducts) summary[p.status] = (summary[p.status] || 0) + 1;

  const report = {
    generatedAt: new Date().toISOString(),
    chunksIncluded: chunks.map((c) => c.chunk).sort(),
    chunksMissing: missing.map((p) => p.split("/").pop()),
    summary,
    products: allProducts,
  };
  await writeFile(
    resolve("scripts/data/impact-verification-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("Wrote impact-verification-report.json");

  // ── Auto-apply patch (Joules only) ────────────────────────────────
  // Conservative rule: only include entries where the rating (Joules)
  // itself differs. PAS 13 method / certified disagreements between
  // the catalog and live pages are frequent but often stem from the
  // live extractor picking the most-visible test video; those need
  // human review rather than auto-apply.
  const ratingPatches = allProducts
    .filter((p) => {
      if (p.status === "catalog_missing" && p.live.impactRating != null) return true;
      if (p.status === "mismatch") {
        const a = p.catalog.impactRating ?? null;
        const b = p.live.impactRating ?? null;
        return a !== b && b != null;
      }
      return false;
    })
    .map((p) => ({
      familyName: p.familyName,
      productUrl: p.productUrl,
      status: p.status,
      currentValue: p.catalog.impactRating ?? null,
      newValue: p.live.impactRating ?? null,
      impactRatingRaw: p.live.impactRatingRaw ?? null,
      vehicleTest: p.live.vehicleTest ?? null,
      // Deliberately NOT propagating pas13Method / pas13Certified to
      // the auto-apply path — see pas13-review.md for the human queue.
      pas13Certified: null,
      pas13Method: null,
      deflectionZoneMm: p.live.deflectionZoneMm ?? null,
      heightMm: p.live.heightMm ?? null,
      notes: p.notes || "",
    }));

  await writeFile(
    resolve("scripts/data/impact-verification-patch.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), patches: ratingPatches },
      null,
      2,
    ),
  );
  console.log(`Wrote impact-verification-patch.json — ${ratingPatches.length} rating corrections`);

  // ── Human-review queue: PAS 13 metadata drifts ───────────────────
  const pas13Drifts = allProducts.filter((p) => {
    if (p.status === "ok") return false;
    const aM = p.catalog.pas13Method ?? null;
    const bM = p.live.pas13Method ?? null;
    const aC = p.catalog.pas13Certified ?? null;
    const bC = p.live.pas13Certified ?? null;
    return (aM !== bM && !(aM == null && bM == null)) || (aC !== bC && !(aC == null && bC == null));
  });

  const reviewLines: string[] = [];
  reviewLines.push("# PAS 13 Metadata Review Queue\n");
  reviewLines.push(`Generated ${new Date().toISOString()}\n`);
  reviewLines.push(
    "These drifts were NOT auto-applied. Live extractor may have picked the most-visible test video from the page while the catalog captured the canonical test method. Reconcile against the official technical sheets before updating the DB.\n",
  );
  reviewLines.push(`Total: ${pas13Drifts.length}\n`);
  for (const p of pas13Drifts) {
    reviewLines.push(`\n### ${p.familyName}`);
    reviewLines.push(`- ${p.productUrl}`);
    reviewLines.push(
      `- pas13Method: catalog=\`${p.catalog.pas13Method ?? "null"}\` vs live=\`${p.live.pas13Method ?? "null"}\``,
    );
    reviewLines.push(
      `- pas13Certified: catalog=\`${p.catalog.pas13Certified ?? "null"}\` vs live=\`${p.live.pas13Certified ?? "null"}\``,
    );
    if (p.notes) reviewLines.push(`- notes: ${p.notes}`);
  }
  await writeFile(resolve("scripts/data/impact-verification-pas13-review.md"), reviewLines.join("\n"));
  console.log(`Wrote impact-verification-pas13-review.md — ${pas13Drifts.length} PAS 13 drifts flagged`);

  // Human-readable summary
  const md: string[] = [];
  md.push(`# Impact Verification Summary\n`);
  md.push(`Generated ${new Date().toISOString()}\n`);
  md.push(`## Counts\n`);
  for (const [k, v] of Object.entries(summary)) md.push(`- **${k}**: ${v}`);
  md.push(`\n## Mismatches (${summary.mismatch || 0})\n`);
  for (const p of allProducts.filter((p) => p.status === "mismatch")) {
    md.push(
      `- **${p.familyName}** — catalog ${p.catalog.impactRating ?? "null"}J → live ${p.live.impactRating ?? "null"}J. ${p.notes || ""}`,
    );
  }
  md.push(`\n## Catalog-missing (live has rating) (${summary.catalog_missing || 0})\n`);
  for (const p of allProducts.filter((p) => p.status === "catalog_missing")) {
    md.push(
      `- **${p.familyName}** — live: ${p.live.impactRating ?? "null"}J (${p.live.impactRatingRaw ?? "no raw text"})`,
    );
  }
  md.push(`\n## Fetch failures (${summary.fetch_failed || 0})\n`);
  for (const p of allProducts.filter((p) => p.status === "fetch_failed")) {
    md.push(`- **${p.familyName}** — ${p.productUrl}`);
  }
  await writeFile(resolve("scripts/data/impact-verification-summary.md"), md.join("\n"));
  console.log("Wrote impact-verification-summary.md");

  // Also patch scripts/data/asafe-catalog.json in place so the catalog
  // enrichment loader serves corrected values immediately on next build.
  // This is safe: we only overwrite entries where we have a live value;
  // fetch_failed / both_missing rows are left alone.
  const catalogPath = resolve("scripts/data/asafe-catalog.json");
  const catalogRaw = await readFile(catalogPath, "utf8");
  const catalog = JSON.parse(catalogRaw) as any;
  const catalogProducts: any[] = Array.isArray(catalog) ? catalog : catalog.products || [];
  const byUrl = new Map<string, any>(
    catalogProducts.map((p: any) => [String(p.productUrl), p]),
  );
  let catalogUpdates = 0;
  for (const p of allProducts) {
    if (p.status === "fetch_failed" || p.status === "both_missing") continue;
    const entry = byUrl.get(p.productUrl);
    if (!entry) continue;
    const live = p.live || {};
    // Only overwrite when we have a live value; never blank-out an
    // existing catalog entry from a partial extraction.
    if (live.impactRating != null) entry.impactRating = live.impactRating;
    if (live.impactRatingRaw) entry.impactRatingRaw = live.impactRatingRaw;
    if (live.vehicleTest) entry.vehicleTest = live.vehicleTest;
    if (live.pas13Method || live.pas13Certified != null) {
      entry.pas13 = entry.pas13 || {};
      if (live.pas13Method) entry.pas13.method = live.pas13Method;
      if (live.pas13Certified != null) entry.pas13.certified = !!live.pas13Certified;
      if (live.impactRating != null) entry.pas13.joules = live.impactRating;
    }
    catalogUpdates++;
  }
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`Patched asafe-catalog.json — ${catalogUpdates} entries updated`);

  console.log("\nSummary:", JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
