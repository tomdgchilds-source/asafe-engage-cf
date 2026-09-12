import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PDFDocument, PDFArray, PDFRawStream, PDFName, type PDFRef } from "pdf-lib";
import { pas13Verdict } from "../../../../shared/pas13Rules";
import { RISK_LEVEL_BANDS } from "../../../../shared/risk/riskRegister";
import { decodeBase64 } from "../assets";
import { SAMPLE_PHOTO_JPEG_B64 } from "../samplePhoto";
import type { RegisterArea, RegisterPhoto, AreaProductRecommendation, CompareResponse } from "../../../routes/siteSurveys";
import type { SurveyBundle, ProductInfo, PhotoInfo } from "./shared";
import type { RenderMeta } from "./proposal";
import { buildRiskAssessmentModel, renderRiskAssessmentModel, investmentProposalModel, type RegisterPayload } from "./riskAssessment";

const OUT_DIR = process.env.PDF_SAMPLE_DIR ?? "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad";

// Smallest valid 1×1 baseline JPEG; pdf-lib embeds it happily.
const ONE_PX_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";
const onePx = () => decodeBase64(ONE_PX_JPEG_B64);
const samplePhoto = () => decodeBase64(SAMPLE_PHOTO_JPEG_B64);

/** pdf-lib deflates content streams and writes text as hex; inflate and search. */
async function containsText(bytes: Uint8Array, s: string): Promise<boolean> {
  const hex = Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toLowerCase();
  const pdf = await PDFDocument.load(bytes);
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : [contents as unknown as PDFRef];
    for (const ref of refs) {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const filter = stream.dict.get(PDFName.of("Filter"));
      const text = filter ? inflateSync(stream.contents).toString("latin1") : Buffer.from(stream.contents).toString("latin1");
      if (text.toLowerCase().includes(hex)) return true;
    }
  }
  return false;
}

async function load(bytes: Uint8Array, name: string) {
  expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  try {
    mkdirSync(dirname(`${OUT_DIR}/${name}`), { recursive: true });
    writeFileSync(`${OUT_DIR}/${name}`, bytes);
  } catch {
    /* scratchpad unavailable */
  }
  return pdf;
}

// ─── Fixture: 3 areas, 6 tiny JPEGs ────────────────────────────────────────

const SURVEY_DATE = new Date("2026-09-09T08:00:00Z");

function product(name: string, family: string, energy: number, img: Uint8Array | null): ProductInfo {
  return {
    id: `p-${name}`,
    name,
    family,
    sku: `${name.slice(0, 3).toUpperCase()}-001`,
    testedEnergyJ: energy,
    keySpecs: [`Tested to PAS 13:2017 at ${energy.toLocaleString("en-GB")} J`, "Memaplex polymer", "Deflection zone 250 mm"],
    description: "Polymer safety barrier that absorbs impact and returns to shape.",
    datasheetUrl: "https://www.asafe.com/datasheets/iflex.pdf",
    deflectionZoneMm: 250,
    imageRef: null,
    imageBytes: img,
  };
}

function rec(name: string, impact: number, opts: Partial<AreaProductRecommendation> = {}): AreaProductRecommendation {
  return {
    productId: `p-${name}`,
    productName: name,
    impactRating: impact,
    imageUrl: null,
    price: 320,
    pricePerMetreAed: null,
    pricingType: "per-unit",
    category: "Barriers",
    safetyMarginPct: 40,
    pas13Verdict: "aligned",
    notAligned: false,
    reason: `${name} exceeds the calculated energy with margin.`,
    ...opts,
  };
}

interface AreaSpec {
  id: string;
  zone: string;
  area: string;
  type: string;
  level: "low" | "medium" | "high" | "critical";
  rank: number;
  l: number;
  s: number;
  vehicleKg: number | null;
  loadKg: number;
  speed: number | null;
  angle: number;
  joules: number | null;
  top: AreaProductRecommendation | null;
  lengthM: number | null;
  estimatedCost: string | null;
  photos: RegisterPhoto[];
}

const photoRow = (id: string, zone: string): RegisterPhoto => ({ id, objectUrl: `/api/objects/surveys/s1/${id}.jpg`, zoneName: zone, takenAt: SURVEY_DATE.toISOString(), analysisStatus: "done" });

const SPECS: AreaSpec[] = [
  {
    id: "a1",
    zone: "Aisle 4 rack ends",
    area: "Aisle 4 rack ends – Racking",
    type: "racking",
    level: "critical",
    rank: 1,
    l: 5,
    s: 4,
    vehicleKg: 3200,
    loadKg: 1200,
    speed: 8,
    angle: 90,
    joules: 10864,
    top: rec("iFlex Single Traffic", 17000, { pricePerMetreAed: 410, pricingType: "per-meter", price: 820 }),
    lengthM: 24,
    estimatedCost: null,
    photos: [photoRow("ph1", "Aisle 4 rack ends"), photoRow("ph2", "Aisle 4 rack ends"), photoRow("ph3", "Aisle 4 rack ends")],
  },
  {
    id: "a2",
    zone: "Dock 3",
    area: "Dock 3 – Loading dock",
    type: "loading_dock",
    level: "high",
    rank: 2,
    l: 4,
    s: 3,
    vehicleKg: 3200,
    loadKg: 1200,
    speed: 8,
    angle: 45,
    joules: 5430,
    top: rec("Bollard Bumper", 11000),
    lengthM: null,
    estimatedCost: "4800.00",
    photos: [photoRow("ph4", "Dock 3"), photoRow("ph5", "Dock 3")],
  },
  {
    id: "a3",
    zone: "Yard columns",
    area: "Yard columns – Column",
    type: "column",
    level: "medium",
    rank: 3,
    l: 3,
    s: 2,
    vehicleKg: null,
    loadKg: 0,
    speed: null,
    angle: 90,
    joules: null,
    top: null,
    lengthM: null,
    estimatedCost: null,
    photos: [photoRow("ph6", "Yard columns")],
  },
];

function registerArea(spec: AreaSpec): RegisterArea {
  const verdict =
    spec.top && spec.vehicleKg && spec.speed
      ? pas13Verdict({ vehicleMassKg: spec.vehicleKg, loadMassKg: spec.loadKg, speedKmh: spec.speed, approachAngleDeg: spec.angle, productRatedJoulesAt45deg: spec.top.impactRating ?? 0, productImpactZoneMaxMm: 250 })
      : null;
  return {
    id: spec.id,
    siteSurveyId: "s1",
    zoneName: spec.zone,
    areaName: spec.area,
    areaType: spec.type,
    areaTypeLabel: spec.type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    currentCondition: "unprotected",
    riskLevel: spec.level,
    likelihood: spec.l,
    severity: spec.s,
    riskScore: spec.l * spec.s,
    priorityRank: spec.rank,
    priority: spec.level === "critical" ? "urgent" : spec.level,
    trafficDensity: "high",
    pedestrianExposure: "frequent",
    existingProtection: "none",
    vehicleWeight: spec.vehicleKg,
    vehicleSpeed: spec.speed,
    impactAngle: spec.angle,
    loadMass: spec.loadKg,
    calculatedJoules: spec.joules,
    recommendedLengthM: spec.lengthM,
    recommendedProducts: spec.top ? [spec.top] : [],
    topProduct: spec.top,
    pas13Verdict: verdict,
    issueDescription: `The ${spec.zone.toLowerCase()} is unprotected and struck regularly.`,
    aiObservation: null,
    recommendedAction: spec.top ? `Install ${spec.top.productName}${spec.lengthM ? ` over ${spec.lengthM} m` : ""}. Action timescale: ${RISK_LEVEL_BANDS.find((b) => b.level === spec.level)?.actionTimescale}.` : null,
    estimatedCost: spec.estimatedCost,
    rationale: [`High traffic density sets likelihood to 4.`, `Frequent pedestrian exposure sets severity to 4.`, `A score of ${spec.l * spec.s} (${spec.l} × ${spec.s}) places the zone at ${spec.level} level.`],
    photos: spec.photos,
    photosUrls: [],
    createdAt: SURVEY_DATE.toISOString(),
    updatedAt: SURVEY_DATE.toISOString(),
  };
}

function bundle(opts: { areas?: boolean; photos?: boolean } = {}): SurveyBundle {
  const survey = {
    id: "s1",
    userId: "u1",
    title: "Al Quoz DC survey",
    facilityName: "Gulf Freight Logistics LLC",
    facilityLocation: "Warehouse 4, Al Quoz Industrial Area 3, Dubai",
    surveyDate: SURVEY_DATE,
    status: "completed",
    description: "Ambient warehouse with 12 aisles of selective racking, three loading docks and a yard used by counterbalance forklifts and delivery trucks.",
    requestedByName: "Aisha Khalil",
    requestedByPosition: "HSE Manager",
    requestedByEmail: "aisha@example.ae",
    requestedByMobile: "+971 50 555 0100",
    previousSurveyId: null,
    snapshot: null,
  } as unknown as SurveyBundle["survey"];
  const areas = opts.areas === false ? [] : SPECS.map((s) => ({ id: s.id, siteSurveyId: "s1", zoneName: s.zone, areaName: s.area, areaType: s.type, riskLevel: s.level, priorityRank: s.rank, riskScore: s.l * s.s, likelihood: s.l, severity: s.s }) as unknown as SurveyBundle["areas"][number]);
  const photos: PhotoInfo[] =
    opts.photos === false || opts.areas === false
      ? []
      : SPECS.flatMap((s) =>
          s.photos.map((p, i) => ({
            id: p.id,
            areaId: s.id,
            zoneName: s.zone,
            objectKey: `surveys/s1/${p.id}.jpg`,
            ref: `/api/objects/surveys/s1/${p.id}.jpg`,
            takenAt: SURVEY_DATE,
            tags: i === 0 ? ["Unprotected rack end", "Pedestrian route"] : [],
            bytes: p.id === "ph1" || p.id === "ph4" ? samplePhoto() : onePx(),
          })),
        );
  return {
    survey,
    areas,
    photos,
    owner: { name: "Rami Haddad", title: "Area Sales Manager", email: "rami@asafe.ae", mobile: "+971 50 000 0000", company: "A-SAFE DWC LLC" },
    products: new Map([
      ["iFlex Single Traffic", product("iFlex Single Traffic", "iFlex", 17000, onePx())],
      ["Bollard Bumper", product("Bollard Bumper", "Bollards", 11000, onePx())],
    ]),
  };
}

function register(opts: { areas?: boolean } = {}): RegisterPayload {
  const areas = opts.areas === false ? [] : SPECS.map(registerArea);
  const matrix = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
  for (const a of areas) matrix[(a.likelihood as number) - 1][(a.severity as number) - 1] += 1;
  const byLevel = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const a of areas) if (a.riskLevel) byLevel[a.riskLevel] += 1;
  return {
    surveyId: "s1",
    areas,
    matrix,
    summary: { total: areas.length, assessed: areas.length, unassessed: 0, byLevel, overallRiskLevel: areas.length ? "critical" : null, photos: areas.reduce((n, a) => n + a.photos.length, 0), highestPriorityAreaId: areas[0]?.id ?? null, highestPriorityZone: areas[0]?.zoneName ?? null },
    bands: RISK_LEVEL_BANDS,
  };
}

function comparison(): CompareResponse {
  return {
    previous: { id: "s0", title: "Al Quoz DC survey (March)", completedAt: "2026-03-10T09:00:00Z" },
    current: { id: "s1", title: "Al Quoz DC survey", completedAt: SURVEY_DATE.toISOString() },
    rows: [
      {
        zone: "Aisle 4 rack ends",
        before: { zoneName: "Aisle 4 rack ends", areaName: "Aisle 4 rack ends – Racking", areaType: "racking", riskLevel: "critical", score: 25, priorityRank: 1, condition: "unprotected", photoKeys: [], observation: "" },
        after: { zoneName: "Aisle 4 rack ends", areaName: "Aisle 4 rack ends – Racking", areaType: "racking", riskLevel: "critical", score: 20, priorityRank: 1, condition: "unprotected", photoKeys: [], observation: "" },
        delta: "improved",
        scoreChange: -5,
        notes: ["Score fell from 25 to 20."],
      },
      { zone: "Yard columns", after: { zoneName: "Yard columns", areaName: "Yard columns – Column", areaType: "column", riskLevel: "medium", score: 6, priorityRank: 3, condition: "unprotected", photoKeys: [], observation: "" }, delta: "new", scoreChange: 6, notes: ["New zone on this visit."] },
    ],
    summary: { improved: 1, same: 0, worse: 0, new: 1, removed: 0, netScoreChange: 1 },
  };
}

const meta = (status: "DRAFT" | "ISSUED"): RenderMeta => ({ status, reference: status === "ISSUED" ? "ASU-RA-2609-0001" : "DRAFT", revision: "A", issuedOn: new Date("2026-09-12T10:00:00Z") });

// ─── Pure model ────────────────────────────────────────────────────────────

describe("buildRiskAssessmentModel", () => {
  it("orders zones by rank, numbers their sections from 5 and takes the timescale from the risk band", () => {
    const model = buildRiskAssessmentModel(bundle(), register());
    expect(model.inProgress).toBe(false);
    expect(model.zones.map((z) => z.zoneName)).toEqual(["Aisle 4 rack ends", "Dock 3", "Yard columns"]);
    expect(model.zones.map((z) => z.section)).toEqual([5, 6, 7]);
    expect(model.zones.map((z) => z.timescale)).toEqual(["Immediate", "30 days", "90 days"]);
    expect(model.zones[0].score).toBe(20);
    expect(model.zones[0].rationale).toHaveLength(3);
    expect(model.zones[0].hazardTags).toEqual(["Unprotected rack end", "Pedestrian route"]);
  });

  it("passes the matrix and level counts through and sizes the KPI inputs", () => {
    const model = buildRiskAssessmentModel(bundle(), register());
    expect(model.matrix[4][3]).toBe(1); // L5 × S4
    expect(model.matrix[3][2]).toBe(1); // L4 × S3
    expect(model.matrix[2][1]).toBe(1); // L3 × S2
    expect(model.matrix.flat().reduce((a, b) => a + b, 0)).toBe(3);
    expect(model.summary.byLevel).toEqual({ low: 0, medium: 1, high: 1, critical: 1 });
    expect(model.summary.overall).toBe("critical");
    expect(model.summary.photos).toBe(6);
    expect(model.topActions).toHaveLength(3);
    expect(model.topActions[0]).toContain("Aisle 4 rack ends");
  });

  it("prices per-metre products by run length, honours a stored estimate, and leaves unpriced zones as null", () => {
    const model = buildRiskAssessmentModel(bundle(), register());
    const [a1, a2, a3] = model.zones;
    expect(a1.indicativeAed).toBe(410 * 24);
    expect(a1.perMetre).toBe(true);
    expect(a1.quantityLine).toBe("24 m");
    expect(a2.indicativeAed).toBe(4800); // estimatedCost wins over the per-unit price
    expect(a3.indicativeAed).toBeNull();
    expect(model.investment).toEqual({ totalAed: 9840 + 4800, pricedZones: 2 });
    const pm = investmentProposalModel(model, meta("DRAFT"));
    expect(pm.lines).toHaveLength(2);
    expect(pm.lines[0].perMetre).toBe(true);
    expect(pm.totals.goodsAed).toBe(9840 + 4800);
  });

  it("builds one fleet row per distinct vehicle with its PAS 13 class and head-on energy", () => {
    const model = buildRiskAssessmentModel(bundle(), register());
    expect(model.fleet).toHaveLength(1);
    const [f] = model.fleet;
    expect(f.classCode).toBe("T3");
    expect(f.massKg).toBe(3200);
    expect(f.loadKg).toBe(1200);
    expect(f.zones).toEqual(["Aisle 4 rack ends", "Dock 3"]);
    expect(Math.round(f.energyJ)).toBe(Math.round(0.5 * 4400 * (8 / 3.6) ** 2));
    // Dock 3 keeps its own 45° energy on the zone.
    expect(model.zones[1].vehicle.angleDeg).toBe(45);
    expect(model.zones[1].vehicle.energyJ).toBe(5430);
    expect(model.zones[1].pas13.requiredWithMarginJ).toBeCloseTo(5430 * 1.3, 6);
    expect(model.zones[1].pas13.verdict).toBe("aligned");
    expect(model.zones[2].vehicle.energyJ).toBeNull();
    expect(model.zones[2].product).toBeNull();
  });

  it("picks the hero from the highest-priority zone, numbers figures per section and indexes every photo", () => {
    const b = bundle();
    const model = buildRiskAssessmentModel(b, register());
    expect(model.heroImage).toBe(b.photos.find((p) => p.id === "ph1")?.bytes);
    expect(model.zones[0].photos.map((p) => p.figure)).toEqual(["Fig 5.1", "Fig 5.2", "Fig 5.3"]);
    expect(model.zones[1].photos.map((p) => p.figure)).toEqual(["Fig 6.1", "Fig 6.2"]);
    expect(model.zones[0].photos[0].caption).toBe("Aisle 4 rack ends – Racking, 9 Sep 2026");
    expect(model.photoIndex).toHaveLength(6);
    expect(model.products.map((p) => p.name)).toEqual(["iFlex Single Traffic", "Bollard Bumper"]);
  });

  it("renders an in-progress model when the register has no areas and carries the comparison strip when given", () => {
    const empty = buildRiskAssessmentModel(bundle({ areas: false }), register({ areas: false }));
    expect(empty.inProgress).toBe(true);
    expect(empty.zones).toEqual([]);
    expect(empty.fleet).toEqual([]);
    expect(empty.investment).toEqual({ totalAed: 0, pricedZones: 0 });
    expect(empty.heroImage).toBeNull();
    const withCmp = buildRiskAssessmentModel(bundle(), register(), { comparison: comparison() });
    expect(withCmp.comparison?.summary.improved).toBe(1);
    expect(withCmp.comparison?.rows).toHaveLength(2);
  });
});

// ─── Rendering ─────────────────────────────────────────────────────────────

describe("renderRiskAssessmentModel", () => {
  it("renders the 3-area fixture with 6 JPEGs to at least 12 pages in under 4 s", async () => {
    const started = Date.now();
    const bytes = await renderRiskAssessmentModel(buildRiskAssessmentModel(bundle(), register(), { comparison: comparison() }), meta("ISSUED"));
    const elapsed = Date.now() - started;
    const pdf = await load(bytes, "risk-assessment-issued.pdf");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(12);
    expect(elapsed).toBeLessThan(4000);
    expect(await containsText(bytes, "RISK REGISTER")).toBe(true);
    expect(await containsText(bytes, "LIMITATIONS")).toBe(true);
    expect(await containsText(bytes, "SINCE LAST VISIT")).toBe(true);
    expect(await containsText(bytes, "Fig 5.1")).toBe(true);
  });

  it("renders a shorter survey-in-progress document for an empty register instead of throwing", async () => {
    const full = await renderRiskAssessmentModel(buildRiskAssessmentModel(bundle(), register()), meta("DRAFT"));
    const empty = await renderRiskAssessmentModel(buildRiskAssessmentModel(bundle({ areas: false }), register({ areas: false })), meta("DRAFT"));
    const a = await PDFDocument.load(full);
    const b = await load(empty, "risk-assessment-in-progress.pdf");
    expect(b.getPageCount()).toBeGreaterThanOrEqual(6);
    expect(b.getPageCount()).toBeLessThan(a.getPageCount());
    expect(await containsText(empty, "Survey in progress")).toBe(true);
    expect(await containsText(empty, "RISK REGISTER")).toBe(false);
  });
});
