import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderSample } from "./sample";

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
