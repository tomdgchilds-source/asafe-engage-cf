// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/orderForm.ts
//
// Order form (ASU-OF-<yymm>-<seq>): the proposal's scope of supply,
// commercial terms and acceptance pages as a standalone document, with a
// document-control block on the first page. Same model as the proposal so
// the figures can never differ between the two.
// ────────────────────────────────────────────────────────────────────────────

import type { Env } from "../../../types";
import { createDoc, addPage, finalize, current } from "../doc";
import { heading, body } from "../text";
import { documentControl } from "../blocks";
import { DOCUMENT_KINDS, DRAFT_REFERENCE } from "../../../../shared/documents/refs";
import { loadOrderBundle, longDate, shortDate } from "./shared";
import {
  buildProposalModel,
  drawScopeOfSupply,
  drawCommercialTerms,
  drawAcceptance,
  renderFromModel,
  type ProposalModel,
  type RenderMeta,
  type RenderDocumentOptions,
  type RenderedDocument,
} from "./proposal";

/** ProposalModel → order-form PDF bytes (document control + scope, terms, acceptance). */
export async function renderOrderFormModel(model: ProposalModel, meta: RenderMeta): Promise<Uint8Array> {
  const doc = await createDoc({
    title: DOCUMENT_KINDS.OF,
    reference: meta.status === "ISSUED" ? meta.reference : DRAFT_REFERENCE,
    revision: meta.revision,
    issuedOn: shortDate(meta.issuedOn),
    docType: DOCUMENT_KINDS.OF,
    status: meta.status,
  });

  let page = addPage(doc);
  heading(page, 1, `Order form — ${model.project.name}`);
  page = current(doc);
  ({ page } = documentControl(doc, page, [
    { key: "Reference", value: meta.status === "ISSUED" ? `${meta.reference} — Rev ${meta.revision}` : "DRAFT — not for issue" },
    { key: "Issue date", value: longDate(meta.issuedOn) },
    { key: "Status", value: meta.status },
    { key: "Client", value: [model.client.company, model.client.contact, model.client.contactTitle].filter(Boolean).join(" — ") },
    { key: "Site", value: [model.project.name, model.project.location].filter(Boolean).join(", ") },
    { key: "Order number", value: model.orderNumber ?? "—" },
    { key: "Prepared by", value: `${model.preparedBy.name}${model.preparedBy.title ? `, ${model.preparedBy.title}` : ""}, A-SAFE UAE` },
    { key: "Currency", value: model.currency + (model.currency !== "AED" ? ` (AED × ${model.fxRate})` : "") },
  ]));
  body(
    page,
    "This order form lists the goods and services to be supplied, the price and the terms. Signed acceptance with a purchase order confirms the order; the layout drawing is then issued for approval before manufacture.",
  );

  drawScopeOfSupply(doc, model, { newPage: false });
  drawCommercialTerms(doc, model);
  drawAcceptance(doc, model);
  return finalize(doc);
}

/** Load the order, build the model, render the order form; ISSUED stores and records it. */
export async function renderOrderForm(
  env: Env,
  orderId: string,
  opts: Omit<RenderDocumentOptions, "orderId">,
): Promise<RenderedDocument | null> {
  const bundle = await loadOrderBundle(env, orderId, { surveyId: opts.surveyId, appOrigin: opts.appOrigin, withImages: false });
  if (!bundle) return null;
  const model = buildProposalModel(bundle);
  return renderFromModel(env, "OF", model, { ...opts, orderId }, (m, meta) => renderOrderFormModel(m, meta));
}
