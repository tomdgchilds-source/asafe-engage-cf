/**
 * Pure helpers for the project Documents tab (Phase 3D Task PD6).
 *
 * The shapes mirror worker/routes/documentRegister.ts. Everything here is
 * side-effect free so the tab's decisions (which renderable a table row
 * re-issues, what the confirm dialog says, what revision comes next) are
 * unit-testable without React.
 */

import { DOCUMENT_KINDS, nextRevision, type DocumentKind } from "@shared/documents/refs";

export interface DocumentSource {
  orderId?: string;
  surveyId?: string;
  drawingId?: string;
  installationId?: string;
}

export interface DocumentIssue {
  id: string;
  kind: DocumentKind;
  label: string;
  ref: string;
  revision: string;
  status: string | null;
  issuedAt: string | null;
  issuedBy: { id: string; name: string } | null;
  objectKey: string | null;
  downloadUrl: string | null;
  source: DocumentSource;
}

export interface RenderableDocument {
  key: string;
  kind: DocumentKind;
  label: string;
  subjectLabel: string;
  source: DocumentSource;
  draftUrl: string;
  issueUrl: string;
  lastIssued?: DocumentIssue;
}

export interface DocumentRegisterResponse {
  issued: DocumentIssue[];
  renderable: RenderableDocument[];
}

/** Label for a kind, tolerating rows whose kind the client does not know. */
export function kindLabel(kind: string): string {
  return (DOCUMENT_KINDS as Record<string, string>)[kind] ?? kind;
}

/** The subject id a source names (an order, survey, drawing or installation). */
export function sourceId(source: DocumentSource): string | null {
  return source.orderId ?? source.surveyId ?? source.drawingId ?? source.installationId ?? null;
}

/** True when an issue row was produced from the same subject as a renderable. */
export function sameSubject(issue: Pick<DocumentIssue, "kind" | "source">, doc: Pick<RenderableDocument, "kind" | "source">): boolean {
  if (issue.kind !== doc.kind) return false;
  const s = doc.source;
  if (s.drawingId) return issue.source.drawingId === s.drawingId;
  if (s.installationId) return issue.source.installationId === s.installationId;
  if (s.orderId) return issue.source.orderId === s.orderId;
  if (s.surveyId) return issue.source.surveyId === s.surveyId && !issue.source.orderId;
  return false;
}

/** Issued rows newest first (ties broken by revision letter, later first). */
export function sortIssuedNewestFirst<T extends Pick<DocumentIssue, "issuedAt" | "revision">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const at = a.issuedAt ? Date.parse(a.issuedAt) : 0;
    const bt = b.issuedAt ? Date.parse(b.issuedAt) : 0;
    if (bt !== at) return bt - at;
    return b.revision.localeCompare(a.revision);
  });
}

/** The renderable a table row's "Issue new revision" should re-issue, if the subject still exists. */
export function renderableForIssue(issue: DocumentIssue, renderable: RenderableDocument[]): RenderableDocument | null {
  return renderable.find((doc) => sameSubject(issue, doc)) ?? null;
}

/** "A" for a first issue, else the letter after the last issued revision. */
export function nextRevisionLabel(lastIssued: Pick<DocumentIssue, "revision"> | null | undefined): string {
  return lastIssued ? nextRevision(lastIssued.revision) : "A";
}

/** Renderables that have never been issued, in the order the server listed them. */
export function neverIssued(renderable: RenderableDocument[]): RenderableDocument[] {
  return renderable.filter((doc) => !doc.lastIssued);
}

/** "12 Sep 2026" (UTC, en-GB); "" for null or junk. */
export function formatIssuedOn(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

export interface IssueConfirmation {
  title: string;
  description: string;
  confirmText: string;
}

/** Copy for the confirm dialog shown before a document is issued. */
export function issueConfirmation(doc: RenderableDocument): IssueConfirmation {
  const rev = nextRevisionLabel(doc.lastIssued);
  const kindTag = `ASU-${doc.kind}`;
  if (doc.lastIssued) {
    return {
      title: `Issue ${doc.label} Rev ${rev}?`,
      description: `${doc.subjectLabel}. Reference ${doc.lastIssued.ref} steps from Rev ${doc.lastIssued.revision} to Rev ${rev}. The PDF is rendered from the current data, stored, and recorded in the register; an issued revision cannot be withdrawn.`,
      confirmText: `Issue Rev ${rev}`,
    };
  }
  return {
    title: `Issue ${doc.label}?`,
    description: `${doc.subjectLabel}. A new ${kindTag} reference is allocated at Rev A. The PDF is rendered from the current data, stored, and recorded in the register; an issued revision cannot be withdrawn.`,
    confirmText: "Issue Rev A",
  };
}

/** Body for POST issueUrl — the subject the renderable names. */
export function issueRequestBody(doc: Pick<RenderableDocument, "source">): DocumentSource {
  return { ...doc.source };
}
