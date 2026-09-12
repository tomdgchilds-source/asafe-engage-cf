import { describe, it, expect } from "vitest";
import {
  formatDocumentRef,
  parseDocumentRef,
  nextRevision,
  yymmFor,
  documentObjectKey,
  documentFilename,
} from "./refs";

describe("formatDocumentRef", () => {
  it("formats ASU-<kind>-<yymm>-<seq> with a four-digit sequence", () => {
    expect(formatDocumentRef("PR", "2609", 1)).toBe("ASU-PR-2609-0001");
    expect(formatDocumentRef("OF", "2609", 42)).toBe("ASU-OF-2609-0042");
    expect(formatDocumentRef("RA", "2701", 12345)).toBe("ASU-RA-2701-12345");
  });

  it("rejects bad input", () => {
    expect(() => formatDocumentRef("XX" as never, "2609", 1)).toThrow();
    expect(() => formatDocumentRef("PR", "269", 1)).toThrow();
    expect(() => formatDocumentRef("PR", "2609", 0)).toThrow();
  });

  it("round-trips through parseDocumentRef", () => {
    expect(parseDocumentRef("ASU-PR-2609-0007")).toEqual({ kind: "PR", yymm: "2609", seq: 7 });
    expect(parseDocumentRef("ENG_QUOAE000123")).toBeNull();
  });
});

describe("yymmFor", () => {
  it("uses the UTC year and month", () => {
    expect(yymmFor(new Date("2026-09-12T10:00:00Z"))).toBe("2609");
    expect(yymmFor(new Date("2027-01-01T00:00:00Z"))).toBe("2701");
  });
});

describe("nextRevision", () => {
  it("starts at A and increments as letters", () => {
    expect(nextRevision(null)).toBe("A");
    expect(nextRevision("")).toBe("A");
    expect(nextRevision("A")).toBe("B");
    expect(nextRevision("Y")).toBe("Z");
    expect(nextRevision("Z")).toBe("AA");
    expect(nextRevision("AZ")).toBe("BA");
  });
});

describe("object key and filename", () => {
  it("stores under documents/<kind>/<ref>-<rev>.pdf", () => {
    expect(documentObjectKey("PR", "ASU-PR-2609-0001", "B")).toBe("documents/PR/ASU-PR-2609-0001-B.pdf");
  });
  it("names drafts and issues distinctly", () => {
    expect(documentFilename("OF", "DRAFT", "A")).toBe("A-SAFE-Order-Form-DRAFT.pdf");
    expect(documentFilename("PR", "ASU-PR-2609-0001", "A")).toBe("A-SAFE-Budgetary-Proposal-ASU-PR-2609-0001-RevA.pdf");
  });
});
