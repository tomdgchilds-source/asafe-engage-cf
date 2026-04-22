// One-shot PDF text extractor for ASAFE_GroundWorks_PRH-1005. Outputs
// raw per-page text to stdout so we can examine the structure before
// turning it into the canonical product-groundworks.json dataset.
//
// Usage:   node scripts/extractGroundWorks.mjs
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "url";

const PDF_URL =
  "file:///Users/thomaschilds/Downloads/wetransfer_engage_2026-04-22_0548/ASAFE_GroundWorks_PRH-1005-A-SAFE-26022024-2-2.pdf";

async function main() {
  const doc = await getDocument({ url: PDF_URL, disableFontFace: true }).promise;
  console.log(`# Pages: ${doc.numPages}`);
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    const items = tc.items.map((it) => it.str);
    console.log(`--- page ${i} ---`);
    console.log(items.join(" "));
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
