// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/sample.ts
//
// Showcase document: exercises every block in blocks.ts with realistic
// A-SAFE content (a fictional Dubai warehouse risk register) so the look can
// be reviewed as a PDF. Not wired to any route. sample.test.ts writes the
// output to the scratchpad for eyeballing.
// ────────────────────────────────────────────────────────────────────────────

import { createDoc, addPage, finalize, mm } from "./doc";
import { heading, body, small, label, bullets } from "./text";
import {
  coverPage,
  sectionDivider,
  documentControl,
  kpiTiles,
  riskMatrix,
  table,
  chip,
  chipRow,
  photo,
  productCard,
  calloutBox,
  signOffBlock,
  hierarchyOfControls,
} from "./blocks";
import { decodeBase64 } from "./assets";
import { SAMPLE_PHOTO_JPEG_B64 } from "./samplePhoto";

export async function renderSample(): Promise<Uint8Array> {
  const photoBytes = decodeBase64(SAMPLE_PHOTO_JPEG_B64);
  const doc = await createDoc({
    title: "Impact Protection Risk Assessment",
    reference: "ASU-RA-2609-0007",
    revision: "A",
    issuedOn: "11 Sep 2026",
    docType: "Impact Protection Risk Assessment",
    status: "ISSUED",
  });

  // 1 · Cover
  await coverPage(doc, {
    heroImage: photoBytes,
    docTypeLine: "Impact Protection Risk Assessment",
    title: "Al Quoz Distribution Centre",
    subtitle: "Workplace transport impact risk survey of the ambient warehouse, loading docks and yard",
    client: "Gulf Freight Logistics LLC",
    site: "Warehouse 4, Al Quoz Industrial Area 3, Dubai",
    date: "11 September 2026",
    preparedBy: "R. Haddad, Area Sales Manager, A-SAFE UAE",
    reference: "ASU-RA-2609-0007  ·  Rev A",
    status: "ISSUED",
  });

  // 2 · Section divider
  await sectionDivider(doc, {
    number: 1,
    title: "Executive summary",
    strap: "Six zones assessed. Two critical, two high. Indicative investment AED 184,600 ex-VAT.",
  });

  // 3 · Document control, KPIs, matrix, callout
  let page = addPage(doc);
  heading(page, 1, "Document control");
  ({ page } = documentControl(doc, page, [
    { key: "Reference", value: "ASU-RA-2609-0007" },
    { key: "Revision", value: "A — first issue" },
    { key: "Issue date", value: "11 September 2026" },
    { key: "Prepared by", value: "Rami Haddad, Area Sales Manager, A-SAFE UAE" },
    { key: "Reviewed by", value: "" },
    { key: "Client / site", value: "Gulf Freight Logistics LLC — Warehouse 4, Al Quoz Industrial Area 3, Dubai" },
    { key: "Distribution", value: "HSE Manager (client); Operations Director (client); A-SAFE UAE estimation team" },
  ]));

  heading(page, 2, "Headline risk profile");
  ({ page } = kpiTiles(doc, page, [
    { label: "Zones assessed", value: "6", sublabel: "Walk-through survey, 4 h 20 min" },
    { label: "Critical + high", value: "4", sublabel: "Require action within 30 days", tone: "critical" },
    { label: "Indicative investment", value: "AED 184,600", sublabel: "Budgetary, ex-VAT, valid 30 days" },
    { label: "Photos on file", value: "23", sublabel: "Evidence index in Appendix C" },
  ]));

  body(
    page,
    "The survey covered the ambient warehouse, four loading docks and the yard between 08:30 and 12:50 on 9 September 2026. Counterbalance forklifts (3,200 kg laden) and pallet trucks share aisles with pedestrians at three points. Rack ends on aisles 2, 4 and 7 are unprotected. The matrix below places every zone by likelihood and severity; the register that follows ranks them.",
  );
  const counts = [
    [0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 1],
    [0, 0, 0, 1, 1],
  ];
  ({ page } = riskMatrix(doc, page, counts, { highlight: [[5, 5], [4, 5]] }));
  ({ page } = calloutBox(doc, page, {
    tone: "black",
    title: "Priority action",
    body: "Protect the rack ends on aisle 4 and the pedestrian crossing at dock 3 within 30 days. Both zones carry a critical score and sit on the main forklift route.",
  }));

  // 4 · Register, hierarchy, zone finding
  page = addPage(doc);
  heading(page, 1, "Risk register");
  small(page, "Likelihood 1–5 × severity 1–5. Score bands: low 1–4, medium 5–9, high 10–15, critical 16–25.");
  ({ page } = table(doc, page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "rank", label: "#", width: mm(8), align: "right" },
      { key: "zone", label: "Zone", width: mm(36) },
      { key: "area", label: "Area type", width: mm(24) },
      { key: "level", label: "Level", width: mm(22) },
      { key: "l", label: "L", width: mm(8), align: "right" },
      { key: "s", label: "S", width: mm(8), align: "right" },
      { key: "score", label: "Score", width: mm(14), align: "right" },
      { key: "action", label: "Recommendation", width: mm(34) },
      { key: "when", label: "Timescale", width: mm(20) },
    ],
    rows: [
      { rank: 1, zone: "A — Aisle 4 rack ends", area: "Racking", level: { text: "Critical", chip: "critical" }, l: 5, s: 5, score: 25, action: "RackGuard end protection", when: "Immediate" },
      { rank: 2, zone: "B — Dock 3 pedestrian crossing", area: "Loading dock", level: { text: "Critical", chip: "critical" }, l: 4, s: 5, score: 20, action: "Pedestrian barrier + gate", when: "Immediate" },
      { rank: 3, zone: "C — Yard column line", area: "External", level: { text: "High", chip: "high" }, l: 5, s: 4, score: 20, action: "Column guards", when: "30 days" },
      { rank: 4, zone: "D — Cold-store door", area: "Doorway", level: { text: "High", chip: "high" }, l: 4, s: 4, score: 16, action: "Door-frame bollards", when: "30 days" },
      { rank: 5, zone: "E — Battery charging bay", area: "Plant", level: { text: "Medium", chip: "medium" }, l: 3, s: 3, score: 9, action: "Traffic barrier", when: "90 days" },
      { rank: 6, zone: "F — Office corridor", area: "Pedestrian", level: { text: "Low", chip: "low" }, l: 2, s: 2, score: 4, action: "Handrail", when: "Planned" },
    ],
  }));

  label(page, "Timescales used in this register");
  ({ page } = chipRow(page, [
    { label: "Immediate", tone: "critical" },
    { label: "30 days", tone: "high" },
    { label: "90 days", tone: "medium" },
    { label: "Planned", tone: "low" },
  ]));

  heading(page, 2, "Hierarchy of controls");
  ({ page } = hierarchyOfControls(doc, page));

  // 5 · Zone finding with photo, product card, sign-off
  page = addPage(doc);
  heading(page, 1, "Zone A — Aisle 4 rack ends");
  chip(page, "Critical · 25", "critical");
  ({ page } = await photo(doc, page, photoBytes, {
    maxW: mm(110),
    maxH: mm(60),
    caption: "Fig 4.1 — Zone A, aisle 4 rack end, 9 Sep 2026",
    tags: ["Unprotected rack end", "Forklift route", "Shared aisle"],
  }));
  heading(page, 3, "Observation");
  body(
    page,
    "The rack end at aisle 4 is unprotected. Counterbalance forklifts turn into the aisle from the main route at an estimated 8 km/h with a 1,200 kg load. Scuff marks on the upright at 0.3 m show previous contact.",
  );
  heading(page, 3, "Risk assessment");
  bullets(page, [
    "Likelihood 5 — daily turning movements at the rack end, evidence of past contact.",
    "Severity 5 — upright failure risks a rack collapse over an occupied picking face.",
  ]);
  heading(page, 3, "Recommendation");
  ({ page } = await productCard(doc, page, {
    name: "iFlex RackEnd Barrier",
    family: "iFlex · rack protection",
    testedEnergyJ: 19200,
    keySpecs: [
      "Tested to PAS 13:2017 at 19,200 J; required 14,800 J with 30 % margin",
      "Memaplex polymer, 2.4 m length, 600 mm height, 4 fixings per post",
      "Deflection zone 250 mm — clear of the rack upright",
    ],
    why: "The energy from a 3,200 kg counterbalance truck at 8 km/h striking at 45° is 11,400 J. With the 30 % margin, the required rating is 14,800 J. The RackEnd Barrier is tested above this and keeps the truck off the upright.",
    quantityLine: "4 × 2.4 m",
    unitPriceAed: 6850,
    lineTotalAed: 27400,
  }));
  ({ page } = calloutBox(doc, page, {
    tone: "yellow",
    title: "Action",
    body: "Install within 30 days. Until then, restrict aisle 4 to pallet trucks and mark the rack end with a floor barrier line.",
  }));
  ({ page } = calloutBox(doc, page, {
    tone: "grey",
    title: "Limitations",
    body: "Visual survey only. No destructive testing. Floor construction assumed 150 mm reinforced concrete until verified. Energy calculations indicative until confirmed by the estimation team.",
  }));
  heading(page, 2, "Acceptance");
  ({ page } = signOffBlock(doc, page, [
    { role: "Prepared by", name: "Rami Haddad", title: "Area Sales Manager, A-SAFE UAE", date: "11 Sep 2026" },
    { role: "Reviewed by", title: "A-SAFE UAE estimation team" },
    { role: "Accepted for the client", title: "HSE Manager, Gulf Freight Logistics LLC" },
  ]));

  return finalize(doc);
}
