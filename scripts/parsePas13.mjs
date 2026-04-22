// Extracts text per page from the PAS 13:2017 PDF using pdfjs-dist (legacy
// Node build). The output is a single JSON blob — one entry per page —
// which the follow-on scripts/buildPas13Structure.mjs consumes to derive
// the TOC / definitions / annex structure we need for citations.
//
// Run via: node scripts/parsePas13.mjs > scripts/data/pas13-pages.json
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfUrl =
  "file:///Users/thomaschilds/Downloads/British%20Standard%20-%20PAS_13_Code%20of%20Practice%20-%20PDF_.pdf";

const doc = await getDocument({ url: pdfUrl, useSystemFonts: true }).promise;
const totalPages = doc.numPages;
const pages = [];
for (let i = 1; i <= totalPages; i++) {
  const p = await doc.getPage(i);
  const tc = await p.getTextContent();
  // Preserve ordering but drop zero-width glue — items come ordered
  // in the source stream which is enough for our needle-searches.
  const text = tc.items
    .map((it) => (typeof it.str === "string" ? it.str : ""))
    .filter((s) => s.length > 0)
    .join(" ");
  pages.push({ page: i, text });
}

const out = { totalPages, pages };
const outPath = resolve(__dirname, "data/pas13-pages.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`wrote ${outPath} (${totalPages} pages)`);
