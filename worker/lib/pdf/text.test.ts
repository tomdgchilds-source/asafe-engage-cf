import { describe, it, expect } from "vitest";
import { createDoc, addPage, mm, contentWidth } from "./doc";
import { wrap, measure, sanitize, drawText, heading, body, small, label, bullets } from "./text";
import { TYPE } from "./theme";

const meta = {
  title: "Test",
  reference: "ASU-RA-2609-0002",
  revision: "A",
  issuedOn: "11 Sep 2026",
  docType: "Test document",
  status: "ISSUED" as const,
};

const WORDS =
  "The survey covered the ambient warehouse, four loading docks and the yard. Counterbalance forklifts share aisles with pedestrians at three points and the rack ends on aisles two, four and seven are unprotected. Each zone below carries a rank, a score, a level, an observation, a recommendation and an action timescale.";

function paragraph(words: number): string {
  const src = WORDS.split(" ");
  const out: string[] = [];
  while (out.length < words) out.push(src[out.length % src.length]);
  return out.join(" ");
}

describe("text", () => {
  it("wraps a 300-word paragraph at 160 mm with no line over the width", async () => {
    const doc = await createDoc(meta);
    const text = paragraph(300);
    expect(text.split(" ").length).toBe(300);
    const width = mm(160);
    const lines = wrap(doc.fonts.regular, TYPE.body.size, text, width);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      expect(measure(doc.fonts.regular, TYPE.body.size, line)).toBeLessThanOrEqual(width);
    }
    // Nothing lost in the wrap.
    expect(lines.join(" ").split(" ").length).toBe(300);
  });

  it("breaks words longer than the width and honours newlines", async () => {
    const doc = await createDoc(meta);
    const width = mm(20);
    const lines = wrap(doc.fonts.regular, 9.5, "short\n" + "x".repeat(120), width);
    expect(lines[0]).toBe("short");
    for (const line of lines) expect(measure(doc.fonts.regular, 9.5, line)).toBeLessThanOrEqual(width);
  });

  it("sanitizes characters Helvetica cannot encode", () => {
    expect(sanitize("≥ 19,200 J — 2.4 m × 3")).toBe(">= 19,200 J — 2.4 m × 3");
    expect(sanitize("ok ✓")).toBe("ok Yes");
    expect(sanitize("日本")).toBe("??");
  });

  it("drawText returns the height used and never justifies", async () => {
    const doc = await createDoc(meta);
    const page = addPage(doc);
    const h = drawText(page, paragraph(60), {
      x: page.margin.l,
      y: page.cursorY,
      size: 9.5,
      font: doc.fonts.regular,
      maxWidth: contentWidth(page),
      lineHeight: 13.5,
    });
    expect(h % 13.5).toBeCloseTo(0, 6);
    expect(h).toBeGreaterThan(13.5 * 3);
  });

  it("headings, body, small and label advance the cursor and record the outline", async () => {
    const doc = await createDoc(meta);
    const page = addPage(doc);
    const start = page.cursorY;
    heading(page, 1, "Risk register");
    heading(page, 2, "Zone A");
    heading(page, 3, "Observation");
    body(page, paragraph(40));
    small(page, "Fig 4.2 — Zone B, loading dock 3, 11 Sep 2026");
    label(page, "Prepared by");
    bullets(page, ["Likelihood 5", "Severity 5"]);
    expect(page.cursorY).toBeLessThan(start - mm(40));
    expect(doc.outline.map((o) => o.title)).toEqual(["Risk register", "Zone A", "Observation"]);
    expect(doc.outline[0].page).toBe(1);
  });

  it("body copy flows across pages", async () => {
    const doc = await createDoc(meta);
    const page = addPage(doc);
    body(page, paragraph(3000));
    expect(doc.pages.length).toBeGreaterThanOrEqual(3);
    expect(doc.current?.number).toBe(doc.pages.length);
  });
});
