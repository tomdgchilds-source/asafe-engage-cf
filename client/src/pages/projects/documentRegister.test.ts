import { describe, expect, it } from "vitest";
import {
  formatIssuedOn,
  issueConfirmation,
  issueRequestBody,
  kindLabel,
  neverIssued,
  nextRevisionLabel,
  renderableForIssue,
  sameSubject,
  sortIssuedNewestFirst,
  sourceId,
  type DocumentIssue,
  type RenderableDocument,
} from "./documentRegister";

function issue(over: Partial<DocumentIssue> & { id: string }): DocumentIssue {
  return {
    kind: "PR",
    label: "Budgetary Proposal",
    ref: "ASU-PR-2609-0001",
    revision: "A",
    status: "ISSUED",
    issuedAt: "2026-09-12T10:00:00.000Z",
    issuedBy: { id: "u1", name: "Tom Childs" },
    objectKey: "documents/PR/ASU-PR-2609-0001-A.pdf",
    downloadUrl: "/api/objects/documents/PR/ASU-PR-2609-0001-A.pdf",
    source: { orderId: "o1" },
    ...over,
  };
}

function doc(over: Partial<RenderableDocument> & { key: string }): RenderableDocument {
  return {
    kind: "PR",
    label: "Budgetary Proposal",
    subjectLabel: "Order ORD-1001",
    source: { orderId: "o1" },
    draftUrl: "/api/orders/o1/documents/proposal.pdf?status=draft",
    issueUrl: "/api/projects/p1/documents/PR/issue",
    ...over,
  };
}

describe("kindLabel / sourceId", () => {
  it("labels known kinds and passes unknown ones through", () => {
    expect(kindLabel("OF")).toBe("Order Form");
    expect(kindLabel("ZZ")).toBe("ZZ");
  });
  it("picks the subject id whichever column carries it", () => {
    expect(sourceId({ orderId: "o1" })).toBe("o1");
    expect(sourceId({ drawingId: "d1" })).toBe("d1");
    expect(sourceId({})).toBeNull();
  });
});

describe("sameSubject / renderableForIssue", () => {
  it("matches an order-backed issue to the renderable for the same order and kind", () => {
    const pr = doc({ key: "PR:o1" });
    const of = doc({ key: "OF:o1", kind: "OF" });
    const other = doc({ key: "PR:o2", source: { orderId: "o2" } });
    expect(sameSubject(issue({ id: "i1" }), pr)).toBe(true);
    expect(sameSubject(issue({ id: "i1" }), of)).toBe(false);
    expect(renderableForIssue(issue({ id: "i1" }), [other, of, pr])).toBe(pr);
  });

  it("keys drawings and installations on their own ids", () => {
    const ds = doc({ key: "DS:d1", kind: "DS", source: { drawingId: "d1" } });
    const iv = doc({ key: "IV:in1", kind: "IV", source: { installationId: "in1" } });
    expect(sameSubject(issue({ id: "i1", kind: "DS", source: { drawingId: "d1" } }), ds)).toBe(true);
    expect(sameSubject(issue({ id: "i2", kind: "DS", source: { drawingId: "d2" } }), ds)).toBe(false);
    // An IV row also carries the installation's order; the installation id wins.
    expect(sameSubject(issue({ id: "i3", kind: "IV", source: { installationId: "in1", orderId: "o1" } }), iv)).toBe(true);
  });

  it("does not attach a survey-only renderable to an order-backed issue that merely mentions the survey", () => {
    const ra = doc({ key: "RA:s1", kind: "RA", source: { surveyId: "s1" } });
    expect(sameSubject(issue({ id: "i1", kind: "RA", source: { surveyId: "s1", orderId: "o1" } }), ra)).toBe(false);
    expect(sameSubject(issue({ id: "i2", kind: "RA", source: { surveyId: "s1" } }), ra)).toBe(true);
  });

  it("returns null when the subject no longer exists", () => {
    expect(renderableForIssue(issue({ id: "i1", source: { orderId: "gone" } }), [doc({ key: "PR:o1" })])).toBeNull();
  });
});

describe("sortIssuedNewestFirst", () => {
  it("orders by issuedAt descending, then revision letter", () => {
    const a = issue({ id: "a", issuedAt: "2026-09-01T00:00:00Z", revision: "A" });
    const b = issue({ id: "b", issuedAt: "2026-09-12T00:00:00Z", revision: "B" });
    const c = issue({ id: "c", issuedAt: "2026-09-12T00:00:00Z", revision: "C" });
    const n = issue({ id: "n", issuedAt: null });
    expect(sortIssuedNewestFirst([a, n, b, c]).map((r) => r.id)).toEqual(["c", "b", "a", "n"]);
  });
});

describe("nextRevisionLabel / neverIssued", () => {
  it("starts at A and steps the letter", () => {
    expect(nextRevisionLabel(null)).toBe("A");
    expect(nextRevisionLabel({ revision: "A" })).toBe("B");
    expect(nextRevisionLabel({ revision: "Z" })).toBe("AA");
  });
  it("lists only renderables with no issue", () => {
    const fresh = doc({ key: "PR:o1" });
    const done = doc({ key: "OF:o1", kind: "OF", lastIssued: issue({ id: "i1", kind: "OF" }) });
    expect(neverIssued([done, fresh])).toEqual([fresh]);
  });
});

describe("formatIssuedOn", () => {
  it("prints a short UTC date and tolerates junk", () => {
    // ICU prints September as "Sep" or "Sept" depending on the CLDR version.
    expect(formatIssuedOn("2026-09-12T23:30:00.000Z")).toMatch(/^12 Sept? 2026$/);
    expect(formatIssuedOn(null)).toBe("");
    expect(formatIssuedOn("not a date")).toBe("");
  });
});

describe("issueConfirmation / issueRequestBody", () => {
  it("describes a first issue as a new reference at Rev A", () => {
    const c = issueConfirmation(doc({ key: "PR:o1" }));
    expect(c.title).toBe("Issue Budgetary Proposal?");
    expect(c.description).toContain("ASU-PR");
    expect(c.description).toContain("Rev A");
    expect(c.confirmText).toBe("Issue Rev A");
  });
  it("describes a re-issue as stepping the existing reference", () => {
    const c = issueConfirmation(doc({ key: "PR:o1", lastIssued: issue({ id: "i1", revision: "B" }) }));
    expect(c.title).toBe("Issue Budgetary Proposal Rev C?");
    expect(c.description).toContain("ASU-PR-2609-0001");
    expect(c.description).toContain("Rev B to Rev C");
    expect(c.confirmText).toBe("Issue Rev C");
  });
  it("posts exactly the renderable's source", () => {
    expect(issueRequestBody(doc({ key: "IV:in1", source: { installationId: "in1" } }))).toEqual({ installationId: "in1" });
  });
});
