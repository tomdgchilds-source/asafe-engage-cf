// One-shot PDF → text extractor for the 47-page A-SAFE Product Impact Testing
// master document. Uses pdfjs-dist so image-heavy pages don't blow up the way
// Read(pages=...) does. Dumps one page-delimited text block to stdout.
//
// Usage:  node scripts/extractImpactTestingPdf.mjs /abs/path/to.pdf
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: node extractImpactTestingPdf.mjs <pdf-path>");
  process.exit(1);
}

const url = pdfPath.startsWith("file://") ? pdfPath : `file://${pdfPath}`;

const doc = await getDocument({
  url,
  isEvalSupported: false,
  useSystemFonts: true,
}).promise;

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  // Preserve a rough sense of line structure by inserting a newline when the
  // y-coordinate of a successive item drops noticeably.
  let prevY = null;
  const parts = [];
  for (const it of tc.items) {
    const y = it.transform ? it.transform[5] : null;
    if (prevY != null && y != null && Math.abs(prevY - y) > 3) {
      parts.push("\n");
    }
    parts.push(it.str);
    prevY = y;
  }
  process.stdout.write(`--- page ${i} ---\n${parts.join(" ")}\n`);
}
