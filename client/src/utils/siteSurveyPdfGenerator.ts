import jsPDF from "jspdf";
import asafeLogoImg from "../../../attached_assets/A-SAFE_Logo_Strapline_Secondary_Version_1767686263231.png";

// ═══════════════════════════════════════════════════════════════
// A-SAFE ENGAGE — Site Survey PDF Generator (v2)
//
// Redesigned to a consulting-grade aesthetic:
//  • clean typography, generous whitespace, hairline rules
//  • yellow used only as an accent (not as background noise)
//  • data-first: counts computed from actual area data, not stale DB fields
//  • information-dense: photos, impact calc, recommended products per area
//  • consistent header / footer across every page
// ═══════════════════════════════════════════════════════════════

interface SurveyArea {
  id: string;
  zoneName: string;
  areaName: string;
  areaType: string;
  customApplicationArea?: string;
  issueDescription?: string;
  currentCondition: string;
  riskLevel: string;
  vehicleWeight?: number;
  vehicleSpeed?: number;
  impactAngle?: number;
  calculatedJoules?: number;
  photosUrls?: string[];
  matterportUrl?: string;
  recommendedProducts?: Array<{
    productId: string;
    productName: string;
    imageUrl?: string;
    impactRating?: number;
    reason?: string;
    price?: number;
  }>;
}

interface SiteSurvey {
  id: string;
  title: string;
  facilityName: string;
  facilityLocation: string;
  description?: string;
  overallRiskLevel?: string;
  totalAreasReviewed?: number;
  totalImpactCalculations?: number;
  riskBreakdown?: { critical: number; high: number; medium: number; low: number };
  conditionBreakdown?: { critical: number; damaged: number; unprotected: number; good: number };
  createdAt?: string;
  updatedAt?: string;
  requestedByName?: string;
  requestedByPosition?: string;
  requestedByEmail?: string;
  requestedByMobile?: string;
  companyLogoUrl?: string;
}

interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  phone?: string;
  jobTitle?: string;
  company?: string;
}

// Risk/benefit explainer copy keyed to area type.
const applicationAreaData: Record<string, { risk: string; benefit: string }> = {
  "WorkStation(s)": {
    risk: "Employees seated close to vehicle routes remain exposed while distracted. Basic, non-tested barriers are easily damaged and ineffective against real impacts.",
    benefit: "Impact-rated barriers shield staff, reduce repeat maintenance, and prevent costly downtime from accidents.",
  },
  "Pedestrian Walkways": {
    risk: "Painted lines alone offer no protection. Pedestrians are exposed to vehicles, blocked routes, and poor driver visibility.",
    benefit: "Physical barriers safely segregate pedestrians, maintain evacuation routes, and improve MHE efficiency with fewer obstacles.",
  },
  "Crossing Points / Entry & Exits": {
    risk: "Staff crossing high-traffic or blind spots are vulnerable. Painted markings fail to stop vehicles or distracted pedestrians.",
    benefit: "Guided crossings and barriers provide safe, visible, and controlled movement across vehicle zones.",
  },
  Racking: {
    risk: "Vehicle impacts compromise racking integrity, risking collapse, product loss, and costly replacement.",
    benefit: "Barriers preserve racking stability, prevent collapse, and protect both staff and stored goods.",
  },
  "Shutter Doors": {
    risk: "Vehicle damage disrupts workflows, reduces loading capacity, and compromises environmental control.",
    benefit: "Robust barriers protect doors, maintain security, efficiency, and climate control, while avoiding repair downtime.",
  },
  "Cold Store Walls": {
    risk: "Insulated panels are easily damaged, causing temperature loss, product spoilage, and high repair costs.",
    benefit: "Barriers prevent panel damage, preserve goods, reduce energy waste, and avoid operational disruption.",
  },
  "Fire Hose Cabinets": {
    risk: "Impact damage can render firefighting equipment unusable, delaying emergency response.",
    benefit: "Barriers ensure cabinets remain accessible and operational, protecting staff, assets, and compliance.",
  },
  "Columns (Structural / Mezzanine)": {
    risk: "Impacts from vehicles can damage structural or mezzanine columns, threatening building integrity.",
    benefit: "Impact-rated barriers absorb collisions, protect structures, and prevent costly facility repairs.",
  },
  "Overhead Pipework / Cables": {
    risk: "Overhead utilities are often overlooked. Impacts can disrupt power, processing, or CCTV, causing downtime.",
    benefit: "Barriers protect critical infrastructure, ensuring uninterrupted power and operations.",
  },
  "Loading Docks": {
    risk: "Forklifts risk falling 1–2m from raised docks, endangering operators and damaging equipment.",
    benefit: "Barriers eliminate fall hazards, safeguard operators, and maintain safe, continuous loading operations.",
  },
  "Processing Machines": {
    risk: "Vehicle collisions can cause severe equipment damage, downtime, and injury or fatalities.",
    benefit: "Barriers protect machinery, prevent production halts, and safeguard employees from life-threatening risks.",
  },
  "Electrical DBs": {
    risk: "Impact damage risks short circuits, outages, fires, and prolonged downtime from complex repairs.",
    benefit: "Barriers maintain power continuity, reduce outage risks, and mitigate fire hazards.",
  },
};

// Load an image URL as a data URI with dimensions — throws on failure.
// CRITICAL: /api/objects/* URLs on our own domain require auth cookies.
// We pass credentials: "include" so user-uploaded photos (R2/KV backed)
// actually come through instead of silently returning 401.
async function loadImage(src: string): Promise<{ dataUrl: string; width: number; height: number }> {
  // Absolute-path URLs (/api/...) need the domain prepended so fetch treats them as same-origin.
  let fetchUrl = src;
  if (src.startsWith("/")) {
    fetchUrl = window.location.origin + src;
  }

  // Include credentials for same-origin fetches so auth-gated /api/objects/* URLs work.
  const sameOrigin = fetchUrl.startsWith(window.location.origin);
  const response = await fetch(fetchUrl, sameOrigin ? { credentials: "include" } : {});

  if (!response.ok) throw new Error(`Image HTTP ${response.status}: ${src}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(`Not an image (${contentType}): ${src}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error(`Empty image: ${src}`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const img = new Image();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      img.onload = () => resolve({ dataUrl, width: img.width, height: img.height });
      img.onerror = () => reject(new Error(`Decode failed: ${src}`));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Reader failed: ${src}`));
    reader.readAsDataURL(blob);
  });
}

// ═══════════════════════════════════════════════════════════════
// CATALOG FETCH — mirror of the helper in orderFormPdfGenerator so
// the site-survey PDF can cross-reference each recommended product
// against the live product table (and the scrape-enriched fields:
// description, vehicleTest, impact rating, PAS 13 sections, features,
// applications, full-resolution imageUrl).
// ═══════════════════════════════════════════════════════════════
interface SurveyCatalogProduct {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  category?: string | null;
  impactRating?: number | null;
  pas13Compliant?: boolean | null;
  pas13TestMethod?: string | null;
  pas13TestJoules?: number | null;
  pas13Sections?: string[] | null;
  heightMin?: number | null;
  heightMax?: number | null;
  features?: string[] | null;
  applications?: string[] | null;
  isNew?: boolean;
  isColdStorage?: boolean;
  specifications?: any;
}

async function fetchSurveyCatalog(): Promise<SurveyCatalogProduct[]> {
  try {
    const res = await fetch("/api/products?grouped=false&pageSize=200", {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.products)) return data.products;
    return [];
  } catch (err) {
    console.warn("[siteSurveyPdf] catalog fetch failed", err);
    return [];
  }
}

function matchSurveyCatalog(
  itemName: string,
  catalog: SurveyCatalogProduct[],
): SurveyCatalogProduct | null {
  if (!catalog.length) return null;
  const norm = (s: string) =>
    s.toLowerCase().replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
  const target = norm(itemName);
  const exact = catalog.find((p) => norm(p.name) === target);
  if (exact) return exact;
  const prefix = catalog.find((p) => target.startsWith(norm(p.name)));
  if (prefix) return prefix;
  const contains = catalog.find((p) => target.includes(norm(p.name)));
  return contains ?? null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════

export async function generateSiteSurveyPdf(
  survey: SiteSurvey,
  areas: SurveyArea[],
  userProfile?: UserProfile,
): Promise<void> {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();      // 210
  const pageHeight = pdf.internal.pageSize.getHeight();    // 297
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;             // 174
  let yPosition = 0;
  let currentPageNum = 1;

  // ───── Design tokens ──────────────────────────────────────────
  const ink = {
    black: [17, 24, 39] as [number, number, number],     // #111827
    heading: [15, 23, 42] as [number, number, number],   // #0F172A
    body: [55, 65, 81] as [number, number, number],      // #374151
    muted: [107, 114, 128] as [number, number, number],  // #6B7280
    subtle: [156, 163, 175] as [number, number, number], // #9CA3AF
    line: [229, 231, 235] as [number, number, number],   // #E5E7EB
    softLine: [243, 244, 246] as [number, number, number], // #F3F4F6
    surface: [249, 250, 251] as [number, number, number], // #F9FAFB
    white: [255, 255, 255] as [number, number, number],
  };
  const brand = {
    yellow: [255, 199, 44] as [number, number, number],   // #FFC72C
    yellowDark: [202, 138, 4] as [number, number, number],// #CA8A04
  };
  const risk = {
    critical: [220, 38, 38] as [number, number, number],  // red-600
    high: [234, 88, 12] as [number, number, number],      // orange-600
    medium: [202, 138, 4] as [number, number, number],    // amber-600
    low: [22, 163, 74] as [number, number, number],       // green-600
    none: ink.muted,
  };

  const riskColorFor = (level?: string): [number, number, number] => {
    const k = (level || "").toLowerCase();
    if (k === "critical") return risk.critical;
    if (k === "high") return risk.high;
    if (k === "medium") return risk.medium;
    if (k === "low") return risk.low;
    return risk.none;
  };

  // ───── Catalog preload ────────────────────────────────────────
  // Pull /api/products?grouped=false once so each recommended product
  // can be enriched with scrape-sourced content (full description,
  // vehicleTest, PAS 13 sections, feature bullets, applications) when
  // we render the consolidated Recommended Solutions section. Soft-
  // fails: if the fetch returns nothing we just fall back to whatever
  // lives on area.recommendedProducts.
  const surveyCatalog = await fetchSurveyCatalog();

  // ───── Data computed from actual areas (not stale DB fields) ──
  const areaCount = areas.length;
  const calcCount = areas.filter((a) => typeof a.calculatedJoules === "number" && a.calculatedJoules > 0).length;
  const breakdown = {
    critical: areas.filter((a) => a.riskLevel?.toLowerCase() === "critical").length,
    high:     areas.filter((a) => a.riskLevel?.toLowerCase() === "high").length,
    medium:   areas.filter((a) => a.riskLevel?.toLowerCase() === "medium").length,
    low:      areas.filter((a) => a.riskLevel?.toLowerCase() === "low").length,
  };
  const criticalHigh = breakdown.critical + breakdown.high;
  const recommendedCount = areas.filter((a) => (a.recommendedProducts?.length || 0) > 0).length;
  const computedOverallRisk = breakdown.critical > 0 ? "critical"
                            : breakdown.high > 0     ? "high"
                            : breakdown.medium > 0   ? "medium"
                            : breakdown.low > 0      ? "low"
                            : "not assessed";
  const overallRisk = (survey.overallRiskLevel && survey.overallRiskLevel !== "low") ? survey.overallRiskLevel
                    : computedOverallRisk;
  const reportRef = `SS-${survey.id.substring(0, 8).toUpperCase()}`;
  const assessmentDate = survey.createdAt
    ? new Date(survey.createdAt).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  // ───── Primitives ─────────────────────────────────────────────
  const setFill = (c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: [number, number, number]) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);

  const setFont = (size: number, weight: "normal" | "bold" = "normal") => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", weight);
  };

  // Hairline horizontal rule
  const hr = (y: number, color: [number, number, number] = ink.line, width = 0.3) => {
    setStroke(color);
    pdf.setLineWidth(width);
    pdf.line(margin, y, pageWidth - margin, y);
  };

  // ───── Header (pages 2+) ──────────────────────────────────────
  const pageHeader = async () => {
    // Thin yellow accent strip
    setFill(brand.yellow);
    pdf.rect(0, 0, pageWidth, 2, "F");

    // Logo
    try {
      const logo = await loadImage(asafeLogoImg);
      const maxW = 28, maxH = 10;
      const ratio = logo.width / logo.height;
      const w = ratio > maxW / maxH ? maxW : maxH * ratio;
      const h = ratio > maxW / maxH ? maxW / ratio : maxH;
      pdf.addImage(logo.dataUrl, "PNG", margin, 7, w, h);
    } catch {}

    // Right-side meta
    setFont(7, "normal");
    setText(ink.muted);
    pdf.text("SITE SURVEY REPORT", pageWidth - margin, 10, { align: "right" });
    setFont(7, "bold");
    setText(ink.black);
    pdf.text(`${survey.facilityName.toUpperCase()} · ${reportRef}`, pageWidth - margin, 14, { align: "right" });

    // Bottom hairline
    hr(20);
    yPosition = 28;
  };

  // ───── Footer (every page) ────────────────────────────────────
  const pageFooter = () => {
    const y = pageHeight - 12;
    hr(y - 6);

    // Left — short company line (leaves room for centre + right)
    setFont(7, "normal");
    setText(ink.muted);
    pdf.text("A-SAFE  |  +971 (4) 8842 422  |  sales@asafe.ae", margin, y - 2);

    // Centre — website (brand accent)
    setFont(7, "bold");
    setText(brand.yellowDark);
    pdf.text("www.asafe.com", pageWidth / 2, y - 2, { align: "center" });

    // Right — confidential + page no.
    setFont(7, "normal");
    setText(ink.muted);
    pdf.text(`CONFIDENTIAL  |  Page ${currentPageNum}`, pageWidth - margin, y - 2, { align: "right" });
  };

  const footerSafeBottom = pageHeight - 22;

  const newPage = async () => {
    pageFooter();
    pdf.addPage();
    currentPageNum++;
    yPosition = 0;
    await pageHeader();
  };

  // Reserve space at bottom of page if needed
  const needSpace = async (required: number) => {
    if (yPosition + required > footerSafeBottom) {
      await newPage();
    }
  };

  // ───── Design helpers ─────────────────────────────────────────

  // Section heading: yellow 3mm vertical bar + black caps title
  const sectionHeading = (text: string, subtitle?: string) => {
    const barH = subtitle ? 14 : 10;
    setFill(brand.yellow);
    pdf.rect(margin, yPosition, 1.5, barH, "F");
    setFont(15, "bold");
    setText(ink.heading);
    pdf.text(text.toUpperCase(), margin + 5, yPosition + 7);
    if (subtitle) {
      setFont(9, "normal");
      setText(ink.muted);
      pdf.text(subtitle, margin + 5, yPosition + 12);
    }
    yPosition += barH + 6;
  };

  // Small muted label / eyebrow
  const eyebrow = (text: string, x: number, y: number) => {
    setFont(7, "bold");
    setText(ink.muted);
    pdf.text(text.toUpperCase(), x, y, { charSpace: 0.5 });
  };

  // Risk tag: small colored dot + label
  const riskTag = (level: string, x: number, y: number) => {
    const c = riskColorFor(level);
    setFill(c);
    pdf.circle(x + 1.2, y - 1.2, 1.2, "F");
    setFont(8, "bold");
    setText(c);
    pdf.text(level.toUpperCase(), x + 3.6, y);
  };

  // Text-wrapping helpers
  const wrap = (text: string, maxW: number): string[] => {
    return pdf.splitTextToSize(text, maxW) as string[];
  };

  // ═══════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ═══════════════════════════════════════════════════════════════
  // Top yellow strip (4mm)
  setFill(brand.yellow);
  pdf.rect(0, 0, pageWidth, 3, "F");

  // Logo (top-left, breathing room)
  try {
    const logo = await loadImage(asafeLogoImg);
    const maxW = 46, maxH = 16;
    const ratio = logo.width / logo.height;
    const w = ratio > maxW / maxH ? maxW : maxH * ratio;
    const h = ratio > maxW / maxH ? maxW / ratio : maxH;
    pdf.addImage(logo.dataUrl, "PNG", margin, 16, w, h);
  } catch {}

  // Right-side meta: ref + date
  setFont(8, "normal");
  setText(ink.muted);
  pdf.text(`REPORT REF · ${reportRef}`, pageWidth - margin, 20, { align: "right" });
  pdf.text(`ISSUED · ${assessmentDate}`, pageWidth - margin, 25, { align: "right" });

  // Hero title (upper third of page)
  yPosition = 64;
  setFont(10, "bold");
  setText(brand.yellowDark);
  pdf.text("A-SAFE SITE SURVEY", margin, yPosition, { charSpace: 1.5 });

  yPosition += 12;
  setFont(34, "bold");
  setText(ink.heading);
  pdf.text("Safety Assessment", margin, yPosition);
  yPosition += 12;
  pdf.text("& Risk Analysis", margin, yPosition);

  yPosition += 14;
  hr(yPosition, ink.line, 0.5);
  yPosition += 10;

  // Client block
  setFont(8, "bold");
  setText(ink.muted);
  pdf.text("PREPARED FOR", margin, yPosition, { charSpace: 1 });
  yPosition += 8;
  setFont(22, "bold");
  setText(ink.black);
  pdf.text(survey.facilityName, margin, yPosition);

  yPosition += 8;
  setFont(11, "normal");
  setText(ink.body);
  pdf.text(survey.facilityLocation, margin, yPosition);

  if (survey.title && survey.title.trim() && survey.title !== survey.facilityName) {
    yPosition += 6;
    setFont(10, "normal");
    setText(ink.muted);
    pdf.text(survey.title, margin, yPosition);
  }

  // Optional customer logo (right side, same vertical range)
  if (survey.companyLogoUrl) {
    try {
      const l = await loadImage(survey.companyLogoUrl);
      const maxW = 40, maxH = 26;
      const ratio = l.width / l.height;
      const w = ratio > maxW / maxH ? maxW : maxH * ratio;
      const h = ratio > maxW / maxH ? maxW / ratio : maxH;
      pdf.addImage(l.dataUrl, "PNG", pageWidth - margin - w, 118, w, h);
    } catch {}
  }

  // Contact cards near bottom — clean two-column with thin rule
  const contactY = 190;
  hr(contactY);
  const colW = contentWidth / 2 - 5;

  eyebrow("PREPARED BY", margin, contactY + 8);
  setFont(12, "bold");
  setText(ink.black);
  const repName = userProfile
    ? `${userProfile.firstName || ""} ${userProfile.lastName || ""}`.trim() || "A-SAFE Consultant"
    : "A-SAFE Consultant";
  pdf.text(repName, margin, contactY + 15);

  setFont(9, "normal");
  setText(ink.muted);
  let by = contactY + 21;
  if (userProfile?.jobTitle) { pdf.text(userProfile.jobTitle, margin, by); by += 5; }
  pdf.text(userProfile?.company || "A-SAFE", margin, by); by += 5;
  if (userProfile?.email) { pdf.text(userProfile.email, margin, by); by += 5; }
  if (userProfile?.phone) { pdf.text(userProfile.phone, margin, by); }

  const rightX = margin + colW + 10;
  eyebrow("FACILITY CONTACT", rightX, contactY + 8);
  setFont(12, "bold");
  setText(ink.black);
  pdf.text(survey.requestedByName || "—", rightX, contactY + 15);

  setFont(9, "normal");
  setText(ink.muted);
  let fy = contactY + 21;
  if (survey.requestedByPosition) { pdf.text(survey.requestedByPosition, rightX, fy); fy += 5; }
  if (survey.facilityName) { pdf.text(survey.facilityName, rightX, fy); fy += 5; }
  if (survey.requestedByEmail) { pdf.text(survey.requestedByEmail, rightX, fy); fy += 5; }
  if (survey.requestedByMobile) { pdf.text(survey.requestedByMobile, rightX, fy); }

  // Bottom confidential stripe
  const confY = pageHeight - 24;
  hr(confY, ink.line);
  setFont(8, "bold");
  setText(ink.muted);
  pdf.text("CONFIDENTIAL", margin, confY + 6, { charSpace: 1.5 });
  setFont(8, "normal");
  pdf.text(`A-SAFE DWC-LLC · ${reportRef}`, pageWidth / 2, confY + 6, { align: "center" });
  setFont(8, "bold");
  setText(brand.yellowDark);
  pdf.text("www.asafe.com", pageWidth - margin, confY + 6, { align: "right" });

  pageFooter();

  // ═══════════════════════════════════════════════════════════════
  // PAGE 2 — TABLE OF CONTENTS + SCOPE
  // ═══════════════════════════════════════════════════════════════
  await newPage();
  sectionHeading("Contents", `${areaCount} area${areaCount === 1 ? "" : "s"} assessed · ${calcCount} impact calculation${calcCount === 1 ? "" : "s"}`);

  const recCount = areas.reduce(
    (set, a) => {
      (a.recommendedProducts || []).forEach((p) =>
        set.add(p.productId || p.productName),
      );
      return set;
    },
    new Set<string>(),
  ).size;

  const toc = [
    { n: "01", t: "Executive Summary", d: "Overall risk, metrics, distribution chart" },
    { n: "02", t: "Detailed Area Assessments", d: `${areaCount} area${areaCount === 1 ? "" : "s"} evaluated with risk analysis` },
    { n: "03", t: "Impact Energy Summary", d: calcCount > 0 ? "Per-area kinetic energy calculations" : "No impact calculations performed" },
    { n: "04", t: "Recommended A-SAFE Solutions", d: recCount > 0 ? `${recCount} product${recCount === 1 ? "" : "s"} proposed across the areas` : "Added once products are matched to areas" },
    { n: "05", t: "Implementation Roadmap", d: "Priority plan, timeline, and ROI drivers" },
    { n: "06", t: "Methodology & References", d: "PAS 13, kinetic energy formula, risk criteria" },
    { n: "07", t: "Next Steps", d: "How to action this report with A-SAFE" },
  ];
  toc.forEach((e) => {
    setFont(10, "bold");
    setText(brand.yellowDark);
    pdf.text(e.n, margin, yPosition + 5);

    setFont(12, "bold");
    setText(ink.black);
    pdf.text(e.t, margin + 14, yPosition + 5);

    setFont(9, "normal");
    setText(ink.muted);
    pdf.text(e.d, margin + 14, yPosition + 10);

    yPosition += 16;
    hr(yPosition - 3, ink.softLine);
  });

  // Scope summary block
  yPosition += 6;
  eyebrow("SURVEY SCOPE", margin, yPosition);
  yPosition += 5;
  hr(yPosition, ink.line);
  yPosition += 6;

  const scopeRows: Array<[string, string]> = [
    ["Facility", survey.facilityName],
    ["Location", survey.facilityLocation],
    ["Assessment date", assessmentDate],
    ["Areas assessed", String(areaCount)],
    ["Overall risk", overallRisk.toUpperCase()],
  ];
  scopeRows.forEach(([k, v]) => {
    setFont(9, "normal");
    setText(ink.muted);
    pdf.text(k, margin, yPosition);
    setFont(9, "bold");
    setText(ink.black);
    pdf.text(v, margin + 45, yPosition);
    yPosition += 6;
  });

  // ═══════════════════════════════════════════════════════════════
  // PAGE 3 — EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════
  await newPage();
  sectionHeading("01 · Executive Summary");

  // Overall risk banner — thin with colored bar, not a giant filled box
  const riskC = riskColorFor(overallRisk);
  setFill(riskC);
  pdf.rect(margin, yPosition, 1.5, 18, "F");

  setFont(8, "bold");
  setText(ink.muted);
  pdf.text("OVERALL FACILITY RISK LEVEL", margin + 5, yPosition + 7, { charSpace: 1 });

  setFont(20, "bold");
  setText(riskC);
  pdf.text(overallRisk.toUpperCase(), margin + 5, yPosition + 15);

  // Right-side one-line summary
  setFont(9, "normal");
  setText(ink.body);
  const summaryText = criticalHigh > 0
    ? `${criticalHigh} area${criticalHigh === 1 ? "" : "s"} require immediate attention`
    : (areaCount > 0 ? "No critical or high-risk areas identified" : "No areas surveyed yet");
  pdf.text(summaryText, pageWidth - margin, yPosition + 15, { align: "right" });

  yPosition += 26;
  hr(yPosition);
  yPosition += 8;

  // Three-column key metric row
  const metrics: Array<{ label: string; value: string; tint?: [number, number, number] }> = [
    { label: "Areas assessed", value: String(areaCount) },
    { label: "Impact calculations", value: String(calcCount) },
    { label: "Critical / high-risk", value: String(criticalHigh), tint: criticalHigh > 0 ? risk.high : undefined },
  ];
  const cellW = contentWidth / 3;
  metrics.forEach((m, i) => {
    const x = margin + cellW * i;
    eyebrow(m.label, x, yPosition);
    setFont(28, "bold");
    setText(m.tint || ink.heading);
    pdf.text(m.value, x, yPosition + 14);
  });
  yPosition += 22;
  hr(yPosition);
  yPosition += 10;

  // Risk distribution bar chart — real, with data
  eyebrow("RISK DISTRIBUTION", margin, yPosition);
  yPosition += 6;

  const total = breakdown.critical + breakdown.high + breakdown.medium + breakdown.low;
  if (total > 0) {
    const barH = 10;
    let x = margin;
    const segments: Array<[number, [number, number, number]]> = [
      [breakdown.critical, risk.critical],
      [breakdown.high, risk.high],
      [breakdown.medium, risk.medium],
      [breakdown.low, risk.low],
    ];
    segments.forEach(([count, color]) => {
      if (count > 0) {
        const w = (count / total) * contentWidth;
        setFill(color);
        pdf.rect(x, yPosition, w, barH, "F");
        x += w;
      }
    });
    yPosition += barH + 6;

    // Legend row (4 columns)
    const legendW = contentWidth / 4;
    const legends: Array<[string, number, [number, number, number]]> = [
      ["Critical", breakdown.critical, risk.critical],
      ["High",     breakdown.high,     risk.high],
      ["Medium",   breakdown.medium,   risk.medium],
      ["Low",      breakdown.low,      risk.low],
    ];
    legends.forEach(([label, count, color], i) => {
      const lx = margin + legendW * i;
      setFill(color);
      pdf.rect(lx, yPosition - 2.5, 3, 3, "F");
      setFont(8, "bold");
      setText(ink.black);
      pdf.text(label, lx + 5, yPosition);
      setFont(8, "normal");
      setText(ink.muted);
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      pdf.text(`${count} (${pct}%)`, lx + 5, yPosition + 4);
    });
    yPosition += 12;
  } else {
    setFont(9, "italic");
    setText(ink.muted);
    pdf.text("No risk-level data available — add areas to populate distribution.", margin, yPosition);
    yPosition += 8;
  }

  hr(yPosition);
  yPosition += 10;

  // Key findings — numbered list with hairline separators
  eyebrow("KEY FINDINGS", margin, yPosition);
  yPosition += 6;

  const findings: string[] = [];
  findings.push(`${areaCount} area${areaCount === 1 ? "" : "s"} assessed across ${new Set(areas.map(a => a.zoneName).filter(Boolean)).size || 1} zone${new Set(areas.map(a => a.zoneName).filter(Boolean)).size === 1 ? "" : "s"}.`);
  if (calcCount > 0) findings.push(`${calcCount} impact energy calculation${calcCount === 1 ? "" : "s"} completed using PAS 13:2017 methodology.`);
  if (criticalHigh > 0) findings.push(`${criticalHigh} area${criticalHigh === 1 ? "" : "s"} flagged as critical or high risk — these demand immediate intervention.`);
  if (breakdown.medium > 0) findings.push(`${breakdown.medium} area${breakdown.medium === 1 ? "" : "s"} at medium risk, suitable for a 3-6 month remediation plan.`);
  if (recommendedCount > 0) findings.push(`${recommendedCount} area${recommendedCount === 1 ? "" : "s"} already have matched A-SAFE product recommendations ready to quote.`);
  if (findings.length === 0) findings.push("Baseline survey captured. Add impact calculations and product recommendations to enrich the report.");

  findings.forEach((f, i) => {
    setFont(9, "bold");
    setText(brand.yellowDark);
    pdf.text(String(i + 1).padStart(2, "0"), margin, yPosition);

    setFont(9, "normal");
    setText(ink.body);
    const lines = wrap(f, contentWidth - 10);
    pdf.text(lines, margin + 7, yPosition);
    yPosition += Math.max(5, lines.length * 4.5) + 3;
  });

  // ═══════════════════════════════════════════════════════════════
  // PAGE 4+ — DETAILED AREA ASSESSMENTS
  // ═══════════════════════════════════════════════════════════════
  await newPage();
  sectionHeading("02 · Detailed Area Assessments", `${areaCount} area${areaCount === 1 ? "" : "s"} evaluated`);

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    await needSpace(90); // reserve ~90mm per area block

    // Area header row: index / name / zone / risk
    setFont(8, "bold");
    setText(brand.yellowDark);
    pdf.text(`AREA ${String(i + 1).padStart(2, "0")}`, margin, yPosition);

    setFont(14, "bold");
    setText(ink.black);
    pdf.text(area.areaName || "Unnamed area", margin, yPosition + 7);

    setFont(8, "normal");
    setText(ink.muted);
    pdf.text(`Zone: ${area.zoneName || "—"}`, margin, yPosition + 12);

    // Right side: two stacked tags
    riskTag(area.riskLevel || "none", pageWidth - margin - 40, yPosition + 7);
    setFont(7, "bold");
    setText(ink.muted);
    pdf.text(`CONDITION: ${(area.currentCondition || "—").toUpperCase()}`, pageWidth - margin, yPosition + 12, { align: "right" });

    yPosition += 16;
    hr(yPosition, ink.line);
    yPosition += 6;

    // Two columns — LEFT: facts, RIGHT: first photo (if any)
    const contentStartY = yPosition;
    const leftW = area.photosUrls && area.photosUrls.length > 0 ? contentWidth * 0.62 : contentWidth;
    const rightX = margin + leftW + 6;
    const photoW = contentWidth - leftW - 6;

    // LEFT — facts grid
    const factRows: Array<[string, string]> = [
      ["Application area", area.areaType || (area.customApplicationArea || "—")],
      ["Issue description", area.issueDescription || "—"],
    ];
    if (typeof area.vehicleWeight === "number" && area.vehicleWeight > 0) factRows.push(["Vehicle mass", `${area.vehicleWeight.toLocaleString()} kg`]);
    if (typeof area.vehicleSpeed === "number" && area.vehicleSpeed > 0) factRows.push(["Vehicle speed", `${area.vehicleSpeed} km/h`]);
    if (typeof area.impactAngle === "number" && area.impactAngle > 0) factRows.push(["Impact angle", `${area.impactAngle}°`]);
    if (typeof area.calculatedJoules === "number" && area.calculatedJoules > 0) {
      factRows.push(["Calculated impact", `${Math.round(area.calculatedJoules).toLocaleString()} J`]);
    }
    if (area.matterportUrl) factRows.push(["3D scan", "Matterport link available"]);

    let factY = yPosition;
    factRows.forEach(([k, v]) => {
      setFont(8, "bold");
      setText(ink.muted);
      pdf.text(k, margin, factY);

      setFont(9, "normal");
      setText(ink.body);
      const lines = wrap(v, leftW - 40);
      pdf.text(lines, margin + 32, factY);
      factY += Math.max(5, lines.length * 4) + 2;
    });

    // RIGHT — hero photo (the first uploaded photo, beside the facts grid)
    // Load ALL photos once up front so we can decide layout and not re-fetch.
    const loadedPhotos: Array<{ dataUrl: string; width: number; height: number }> = [];
    if (area.photosUrls && area.photosUrls.length > 0) {
      for (const url of area.photosUrls) {
        try {
          loadedPhotos.push(await loadImage(url));
        } catch (e) {
          console.warn(`[siteSurveyPdf] Skipping photo: ${url}`, e);
        }
      }
    }

    if (loadedPhotos.length > 0) {
      const hero = loadedPhotos[0];
      const maxH = Math.max(40, factY - yPosition);
      const ratio = hero.width / hero.height;
      let pw = photoW;
      let ph = pw / ratio;
      if (ph > maxH) { ph = maxH; pw = ph * ratio; }
      pdf.addImage(hero.dataUrl, "JPEG", rightX + (photoW - pw) / 2, yPosition, pw, ph);

      // Photo count caption
      setFont(7, "italic");
      setText(ink.subtle);
      pdf.text(
        loadedPhotos.length > 1
          ? `Photo 1 of ${loadedPhotos.length}`
          : "Site reference photo",
        rightX + photoW / 2,
        yPosition + ph + 4,
        { align: "center" }
      );
    } else if (area.photosUrls && area.photosUrls.length > 0) {
      // We tried to load photos but they all failed
      setStroke(ink.line);
      pdf.setLineWidth(0.3);
      pdf.rect(rightX, yPosition, photoW, 38);
      setFont(8, "italic");
      setText(ink.subtle);
      pdf.text("Photos unavailable", rightX + photoW / 2, yPosition + 22, { align: "center" });
    }

    yPosition = Math.max(factY, contentStartY + 40);

    // Risk & Benefit inline paragraph (if area type has canned copy)
    const aData = applicationAreaData[area.areaType];
    if (aData) {
      yPosition += 4;
      const half = contentWidth / 2 - 3;

      // Left — Risk
      setFont(7, "bold");
      setText(risk.critical);
      pdf.text("CURRENT RISK", margin, yPosition, { charSpace: 0.5 });
      setFont(8, "normal");
      setText(ink.body);
      const rlines = wrap(aData.risk, half);
      pdf.text(rlines, margin, yPosition + 4);

      // Right — Benefit
      setFont(7, "bold");
      setText(risk.low);
      pdf.text("SAFETY BENEFIT", margin + half + 6, yPosition, { charSpace: 0.5 });
      setFont(8, "normal");
      setText(ink.body);
      const blines = wrap(aData.benefit, half);
      pdf.text(blines, margin + half + 6, yPosition + 4);

      const maxLines = Math.max(rlines.length, blines.length);
      yPosition += 4 + maxLines * 4 + 4;
    }

    // Additional site photos — 3-column gallery of photos 2..N (photo 1 is the hero)
    if (loadedPhotos.length > 1) {
      yPosition += 4;
      await needSpace(16);
      eyebrow(`SITE PHOTOS (${loadedPhotos.length})`, margin, yPosition);
      yPosition += 5;

      const cols = 3;
      const gap = 3;
      const cellW = (contentWidth - gap * (cols - 1)) / cols;
      const cellH = 34;
      const extras = loadedPhotos.slice(1); // photo 0 was hero above

      for (let pi = 0; pi < extras.length; pi++) {
        const photo = extras[pi];
        const col = pi % cols;
        const row = Math.floor(pi / cols);

        if (col === 0 && row > 0) {
          yPosition += cellH + 8;
          await needSpace(cellH + 8);
        }

        const x = margin + col * (cellW + gap);
        // Fit image into cell preserving aspect ratio
        const r = photo.width / photo.height;
        let ph = cellH;
        let pw = ph * r;
        if (pw > cellW) { pw = cellW; ph = pw / r; }
        const ox = x + (cellW - pw) / 2;
        const oy = yPosition + (cellH - ph) / 2;

        // Subtle border around cell
        setStroke(ink.line);
        pdf.setLineWidth(0.2);
        pdf.rect(x, yPosition, cellW, cellH);

        try {
          pdf.addImage(photo.dataUrl, "JPEG", ox, oy, pw, ph);
        } catch {}

        // Photo number caption at bottom-left of cell
        setFont(6, "normal");
        setText(ink.subtle);
        pdf.text(`Photo ${pi + 2}`, x + 1, yPosition + cellH - 1);
      }
      // Advance below the last row
      const rowsUsed = Math.ceil(extras.length / cols);
      yPosition += rowsUsed * cellH + (rowsUsed - 1) * 8 + 6;
    }

    // Recommended products (compact chip row)
    if (area.recommendedProducts && area.recommendedProducts.length > 0) {
      yPosition += 2;
      eyebrow("RECOMMENDED SOLUTIONS", margin, yPosition);
      yPosition += 5;

      for (const p of area.recommendedProducts.slice(0, 4)) {
        await needSpace(14);
        // Small chip: [name] ···· [rating] [margin]
        setFont(9, "bold");
        setText(ink.black);
        const name = p.productName.length > 50 ? p.productName.substring(0, 48) + "…" : p.productName;
        pdf.text(name, margin + 3, yPosition);

        if (p.impactRating) {
          setFont(8, "normal");
          setText(ink.muted);
          pdf.text(`${p.impactRating.toLocaleString()} J rated`, pageWidth - margin - 45, yPosition, { align: "right" });

          if (area.calculatedJoules && area.calculatedJoules > 0) {
            const sm = Math.round(((p.impactRating - area.calculatedJoules) / area.calculatedJoules) * 100);
            const mcolor = sm >= 20 ? risk.low : sm >= 0 ? risk.medium : risk.critical;
            setFont(8, "bold");
            setText(mcolor);
            pdf.text(`${sm >= 0 ? "+" : ""}${sm}% margin`, pageWidth - margin, yPosition, { align: "right" });
          }
        }
        yPosition += 5;
        hr(yPosition, ink.softLine, 0.2);
        yPosition += 2;
      }

      if (area.recommendedProducts.length > 4) {
        setFont(8, "italic");
        setText(ink.subtle);
        pdf.text(`+ ${area.recommendedProducts.length - 4} more recommended`, margin, yPosition);
        yPosition += 4;
      }
    }

    // Area separator
    if (i < areas.length - 1) {
      yPosition += 6;
      hr(yPosition, ink.line, 0.5);
      yPosition += 8;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // IMPACT ENERGY SUMMARY (table)
  // ═══════════════════════════════════════════════════════════════
  const withCalc = areas.filter((a) => typeof a.calculatedJoules === "number" && a.calculatedJoules > 0);
  if (withCalc.length > 0) {
    await newPage();
    sectionHeading("03 · Impact Energy Summary", "Kinetic energy calculated per PAS 13:2017 methodology");

    // Table header
    setFill(ink.black);
    pdf.rect(margin, yPosition, contentWidth, 7, "F");
    setFont(7, "bold");
    setText(ink.white);
    const colX = [margin + 3, margin + 68, margin + 98, margin + 120, margin + 142];
    pdf.text("AREA", colX[0], yPosition + 4.8);
    pdf.text("MASS (kg)", colX[1], yPosition + 4.8);
    pdf.text("SPEED", colX[2], yPosition + 4.8);
    pdf.text("ANGLE", colX[3], yPosition + 4.8);
    pdf.text("IMPACT (J)", colX[4], yPosition + 4.8);
    yPosition += 7;

    // Rows
    withCalc.forEach((a, idx) => {
      if (idx % 2 === 0) {
        setFill(ink.surface);
        pdf.rect(margin, yPosition, contentWidth, 7, "F");
      }
      setFont(8, "normal");
      setText(ink.body);
      pdf.text((a.areaName || "—").substring(0, 30), colX[0], yPosition + 4.8);
      pdf.text(String(a.vehicleWeight || "—"), colX[1], yPosition + 4.8);
      pdf.text(a.vehicleSpeed ? `${a.vehicleSpeed} km/h` : "—", colX[2], yPosition + 4.8);
      pdf.text(a.impactAngle ? `${a.impactAngle}°` : "—", colX[3], yPosition + 4.8);
      setFont(8, "bold");
      setText(ink.black);
      pdf.text(Math.round(a.calculatedJoules!).toLocaleString(), colX[4], yPosition + 4.8);
      yPosition += 7;
    });

    hr(yPosition, ink.line, 0.5);
    yPosition += 4;

    // Totals row
    const total = withCalc.reduce((s, a) => s + (a.calculatedJoules || 0), 0);
    const avg = withCalc.length > 0 ? total / withCalc.length : 0;
    const max = Math.max(...withCalc.map((a) => a.calculatedJoules || 0));
    setFont(8, "bold");
    setText(ink.muted);
    pdf.text("TOTAL", colX[0], yPosition + 5);
    pdf.text(`Σ ${Math.round(total).toLocaleString()} J`, colX[4], yPosition + 5);
    yPosition += 6;
    setFont(8, "normal");
    setText(ink.muted);
    pdf.text("AVG", colX[0], yPosition + 5);
    pdf.text(`${Math.round(avg).toLocaleString()} J`, colX[4], yPosition + 5);
    yPosition += 6;
    pdf.text("MAX", colX[0], yPosition + 5);
    pdf.text(`${Math.round(max).toLocaleString()} J`, colX[4], yPosition + 5);
    yPosition += 8;
  }

  // ═══════════════════════════════════════════════════════════════
  // RECOMMENDED A-SAFE SOLUTIONS
  //
  // Consolidated palette of products recommended across all areas.
  // Each row is a spec card mirroring the order-form Proposed Solutions
  // style: joules hero, vehicle test, PAS 13 sections, feature bullets,
  // and the areas where the product applies. Uses the catalog preload
  // so we can enrich each recommendation with scrape-sourced content
  // (full description, vehicleTest, feature list, applications).
  // ═══════════════════════════════════════════════════════════════
  type Rec = {
    productId: string;
    productName: string;
    imageUrl?: string;
    impactRating?: number;
    price?: number;
    areas: string[]; // area names where this product was recommended
  };
  const recMap = new Map<string, Rec>();
  for (const a of areas) {
    const list = a.recommendedProducts || [];
    for (const p of list) {
      const key = p.productId || p.productName;
      if (!recMap.has(key)) {
        recMap.set(key, {
          productId: p.productId,
          productName: p.productName,
          imageUrl: p.imageUrl,
          impactRating: p.impactRating,
          price: p.price,
          areas: [],
        });
      }
      const entry = recMap.get(key)!;
      if (a.areaName && !entry.areas.includes(a.areaName))
        entry.areas.push(a.areaName);
    }
  }
  const recs = Array.from(recMap.values());

  if (recs.length > 0) {
    await newPage();
    sectionHeading(
      "04 · Recommended A-SAFE Solutions",
      `${recs.length} product${recs.length === 1 ? "" : "s"} proposed across the surveyed areas`,
    );

    // Preload each recommendation's image (catalog takes priority over
    // the thumbnail snapshot the surveyor selected).
    const resolved = await Promise.all(
      recs.map(async (r) => {
        const cat = matchSurveyCatalog(r.productName, surveyCatalog);
        const url = r.imageUrl || cat?.imageUrl || null;
        let img: { dataUrl: string; width: number; height: number } | null = null;
        if (url) {
          try {
            img = await loadImage(url);
          } catch {
            img = null;
          }
        }
        return { r, cat, img };
      }),
    );

    const cardH = 78;
    const imgBoxW = 44;
    const statsColW = 38;

    for (let i = 0; i < resolved.length; i++) {
      const { r, cat, img } = resolved[i];
      await needSpace(cardH + 6);
      const cardY = yPosition;
      const textX = margin + imgBoxW + 6;
      const textW = contentWidth - imgBoxW - 6;
      const infoColW = textW - statsColW - 4;

      setFont(7, "bold");
      setText(brand.yellowDark);
      pdf.text(
        `RECOMMENDATION ${String(i + 1).padStart(2, "0")}`,
        margin,
        cardY - 1,
      );
      hr(cardY, ink.line, 0.3);

      // LEFT — image frame
      if (img) {
        const ratio = img.width / img.height;
        let iw = imgBoxW;
        let ih = iw / ratio;
        if (ih > cardH - 4) {
          ih = cardH - 4;
          iw = ih * ratio;
        }
        const ox = margin + (imgBoxW - iw) / 2;
        const oy = cardY + (cardH - ih) / 2;
        setStroke(ink.line);
        pdf.setLineWidth(0.2);
        pdf.rect(margin, cardY + 2, imgBoxW, cardH - 4);
        try {
          pdf.addImage(img.dataUrl, "JPEG", ox, oy, iw, ih);
        } catch {
          /* ignore */
        }
      } else {
        setFill(ink.surface);
        pdf.rect(margin, cardY + 2, imgBoxW, cardH - 4, "F");
        setFont(8, "italic");
        setText(ink.subtle);
        pdf.text("Image unavailable", margin + imgBoxW / 2, cardY + cardH / 2, {
          align: "center",
        });
      }

      // RIGHT — name + description
      let ty = cardY + 6;
      setFont(12, "bold");
      setText(ink.black);
      const nameLines = wrap(r.productName, infoColW);
      pdf.text(nameLines[0], textX, ty);
      ty += 5;
      const desc = cat?.description || "";
      if (desc) {
        setFont(8, "normal");
        setText(ink.body);
        const lines = wrap(desc, infoColW).slice(0, 2);
        pdf.text(lines, textX, ty);
        ty += lines.length * 3.8 + 1;
      }

      // Feature bullets (from scraped catalog)
      const features = (cat?.features ?? []).filter(Boolean).slice(0, 2);
      features.forEach((f) => {
        setFont(8, "bold");
        setText(brand.yellowDark);
        pdf.text("✓", textX, ty);
        setFont(8, "normal");
        setText(ink.body);
        const fl = wrap(f, infoColW - 4).slice(0, 1);
        pdf.text(fl[0], textX + 4, ty);
        ty += 4;
      });

      // Areas this product addresses
      if (r.areas.length > 0) {
        ty += 2;
        setFont(7, "bold");
        setText(ink.muted);
        pdf.text("ADDRESSES", textX, ty, { charSpace: 0.4 });
        ty += 4;
        setFont(8, "normal");
        setText(ink.body);
        const areaSummary = r.areas.slice(0, 4).join(" · ");
        const al = wrap(areaSummary, infoColW).slice(0, 2);
        pdf.text(al, textX, ty);
        ty += al.length * 3.8;
      }

      // RIGHT — stats column (joules + PAS 13)
      const statsX = textX + infoColW + 4;
      const statsY = cardY + 6;
      setFill(ink.surface);
      pdf.rect(statsX, statsY - 1, statsColW, 32, "F");

      const rating = r.impactRating ?? cat?.impactRating ?? null;
      if (rating) {
        setFont(18, "bold");
        setText(ink.black);
        pdf.text(`${rating.toLocaleString()}`, statsX + 2, statsY + 7);
        setFont(7, "bold");
        setText(ink.muted);
        pdf.text("J RATED", statsX + 2, statsY + 11, { charSpace: 0.4 });
      } else {
        setFont(8, "italic");
        setText(ink.muted);
        pdf.text("Rating on", statsX + 2, statsY + 6);
        pdf.text("request", statsX + 2, statsY + 10);
      }

      const vehicleTest =
        (cat as any)?.vehicleTest ||
        cat?.specifications?.vehicleTest ||
        null;
      if (vehicleTest) {
        setFont(7, "bold");
        setText(ink.muted);
        pdf.text("TESTED AT", statsX + 2, statsY + 16, { charSpace: 0.4 });
        setFont(7, "normal");
        setText(ink.body);
        const vtLines = wrap(vehicleTest, statsColW - 4).slice(0, 2);
        pdf.text(vtLines, statsX + 2, statsY + 20);
      }

      if (cat?.pas13Compliant) {
        const ribbonY = statsY + 28;
        setFont(7, "bold");
        setText(brand.yellowDark);
        pdf.text("PAS 13", statsX + 2, ribbonY, { charSpace: 0.4 });
        const sections = cat.pas13Sections || [];
        setFont(7, "normal");
        setText(ink.body);
        pdf.text(
          sections.length ? `§ ${sections.slice(0, 3).join(", ")}` : "Certified",
          statsX + 14,
          ribbonY,
        );
      }

      yPosition = cardY + cardH + 4;
    }

    // Short explainer under the card stack
    await needSpace(18);
    yPosition += 4;
    setFont(8, "italic");
    setText(ink.muted);
    const expl =
      "Impact ratings shown are A-SAFE's tested performance under PAS 13:2017. Cross-reference with the kinetic energy calculated per area above; the recommended product should exceed the area's peak joules by a safety margin of 20% or more. Your A-SAFE consultant will confirm final selection during layout design.";
    const explLines = wrap(expl, contentWidth);
    pdf.text(explLines, margin, yPosition);
    yPosition += explLines.length * 3.8 + 4;
  }

  // ═══════════════════════════════════════════════════════════════
  // IMPLEMENTATION ROADMAP
  // ═══════════════════════════════════════════════════════════════
  await newPage();
  sectionHeading("05 · Implementation Roadmap", "Recommended phasing based on risk level");

  const phases = [
    { phase: "01", name: "IMMEDIATE",   range: "0-30 days",     focus: "Critical-risk areas",            color: risk.critical, count: breakdown.critical },
    { phase: "02", name: "SHORT TERM",  range: "1-3 months",    focus: "High-risk zones",                color: risk.high,     count: breakdown.high },
    { phase: "03", name: "MEDIUM TERM", range: "3-6 months",    focus: "Medium-risk areas",              color: risk.medium,   count: breakdown.medium },
    { phase: "04", name: "LONG TERM",   range: "6-12 months",   focus: "Low-risk + preventive upgrades", color: risk.low,      count: breakdown.low },
  ];

  // Table header
  setFill(ink.black);
  pdf.rect(margin, yPosition, contentWidth, 7, "F");
  setFont(7, "bold");
  setText(ink.white);
  pdf.text("PHASE",   margin + 3,   yPosition + 4.8);
  pdf.text("TIMELINE", margin + 30, yPosition + 4.8);
  pdf.text("FOCUS",    margin + 70, yPosition + 4.8);
  pdf.text("AREAS",    pageWidth - margin - 3, yPosition + 4.8, { align: "right" });
  yPosition += 7;

  phases.forEach((p, idx) => {
    if (idx % 2 === 0) {
      setFill(ink.surface);
      pdf.rect(margin, yPosition, contentWidth, 12, "F");
    }
    setFill(p.color);
    pdf.rect(margin, yPosition, 1.5, 12, "F");

    setFont(9, "bold");
    setText(ink.black);
    pdf.text(`${p.phase} · ${p.name}`, margin + 4, yPosition + 5);

    setFont(9, "normal");
    setText(ink.body);
    pdf.text(p.range, margin + 30, yPosition + 5);
    pdf.text(p.focus, margin + 70, yPosition + 5);

    setFont(11, "bold");
    setText(p.color);
    pdf.text(String(p.count), pageWidth - margin - 3, yPosition + 8, { align: "right" });
    yPosition += 12;
  });

  yPosition += 6;
  hr(yPosition);
  yPosition += 8;

  // Return on safety investment
  eyebrow("RETURN ON SAFETY INVESTMENT", margin, yPosition);
  yPosition += 6;
  const roi = [
    "Reduced accident rates and associated claim costs",
    "Lower insurance premiums through risk mitigation",
    "Improved productivity from a safer working environment",
    "Compliance with HSE regulations and PAS 13 standards",
  ];
  roi.forEach((r) => {
    setFill(brand.yellow);
    pdf.circle(margin + 1, yPosition - 1.2, 1, "F");
    setFont(9, "normal");
    setText(ink.body);
    pdf.text(r, margin + 5, yPosition);
    yPosition += 5;
  });
  yPosition += 4;

  // ═══════════════════════════════════════════════════════════════
  // METHODOLOGY
  // ═══════════════════════════════════════════════════════════════
  await needSpace(80);
  yPosition += 6;
  sectionHeading("06 · Methodology & References");

  // Risk level definitions table
  eyebrow("RISK LEVEL CRITERIA", margin, yPosition);
  yPosition += 6;

  const criteria = [
    { level: "Critical", color: risk.critical, def: "Immediate threat to life or major asset damage. Requires intervention within 30 days." },
    { level: "High",     color: risk.high,     def: "Likely injury or significant downtime if unaddressed. Plan within 1-3 months." },
    { level: "Medium",   color: risk.medium,   def: "Foreseeable incidents with moderate impact. Upgrade within 3-6 months." },
    { level: "Low",      color: risk.low,      def: "Minor exposure; preventive measures recommended within 6-12 months." },
  ];
  criteria.forEach((c) => {
    setFill(c.color);
    pdf.rect(margin, yPosition - 3, 1.5, 8, "F");
    setFont(9, "bold");
    setText(c.color);
    pdf.text(c.level.toUpperCase(), margin + 4, yPosition);
    setFont(9, "normal");
    setText(ink.body);
    const lines = wrap(c.def, contentWidth - 30);
    pdf.text(lines, margin + 28, yPosition);
    yPosition += Math.max(6, lines.length * 4 + 2);
  });

  yPosition += 6;
  hr(yPosition);
  yPosition += 8;

  eyebrow("KINETIC ENERGY FORMULA", margin, yPosition);
  yPosition += 5;
  setFont(12, "bold");
  setText(ink.black);
  pdf.text("KE = 0.5 x m x (v x sin(angle))^2", margin, yPosition + 5);
  yPosition += 10;

  setFont(9, "normal");
  setText(ink.body);
  const variables = [
    "KE     -  Kinetic energy in joules (J)",
    "m      -  Total mass = vehicle + payload (kg)",
    "v      -  Vehicle velocity (m/s; mph x 0.447 or km/h / 3.6)",
    "angle  -  Impact angle from barrier (0-90 degrees)",
  ];
  variables.forEach((v) => { pdf.text(v, margin, yPosition); yPosition += 4; });

  yPosition += 6;
  hr(yPosition);
  yPosition += 8;

  eyebrow("REFERENCES", margin, yPosition);
  yPosition += 5;
  setFont(9, "normal");
  setText(ink.body);
  [
    "PAS 13:2017  -  Safety barriers used in traffic management. Specification.",
    "ISO 45001    -  Occupational health and safety management systems.",
    "A-SAFE Test Laboratory - In-house crash-test facility, Halifax UK.",
  ].forEach((r) => { pdf.text(r, margin, yPosition); yPosition += 4; });

  // ═══════════════════════════════════════════════════════════════
  // NEXT STEPS
  // ═══════════════════════════════════════════════════════════════
  await newPage();
  sectionHeading("07 · Next Steps", "How to action this survey with A-SAFE");

  const steps = [
    { n: "01", t: "Internal review",   d: "Share this report with your health & safety committee and operations team." },
    { n: "02", t: "Prioritise",         d: "Decide which critical / high-risk areas to address first based on operational impact." },
    { n: "03", t: "Request a quote",    d: "Reply with the areas you want to action; your A-SAFE consultant will build a detailed proposal." },
    { n: "04", t: "Schedule",           d: "A-SAFE installers can be on-site within 2-4 weeks; existing operations continue during fit-out." },
    { n: "05", t: "Follow-up review",   d: "6 months post-install, we return to measure risk-reduction and refine the long-term plan." },
  ];
  steps.forEach((s) => {
    setFont(11, "bold");
    setText(brand.yellowDark);
    pdf.text(s.n, margin, yPosition + 4);

    setFont(11, "bold");
    setText(ink.black);
    pdf.text(s.t, margin + 14, yPosition + 4);

    setFont(9, "normal");
    setText(ink.body);
    const lines = wrap(s.d, contentWidth - 16);
    pdf.text(lines, margin + 14, yPosition + 10);

    yPosition += Math.max(14, lines.length * 4 + 10);
    hr(yPosition - 3, ink.softLine);
  });

  yPosition += 8;

  // Contact banner — sober, not shouting
  setFill(ink.black);
  pdf.rect(margin, yPosition, contentWidth, 24, "F");
  setFill(brand.yellow);
  pdf.rect(margin, yPosition, 1.5, 24, "F");

  setFont(8, "bold");
  setText(brand.yellow);
  pdf.text("ACTION THIS REPORT", margin + 6, yPosition + 8, { charSpace: 1 });
  setFont(11, "bold");
  setText(ink.white);
  pdf.text("Contact your A-SAFE sales consultant", margin + 6, yPosition + 15);
  setFont(9, "normal");
  setText([200, 200, 200]);
  pdf.text("sales@asafe.ae  ·  +971 (4) 8842 422  ·  www.asafe.com", margin + 6, yPosition + 20);

  // Final footer + save
  pageFooter();
  const safeName = survey.facilityName.replace(/[^a-zA-Z0-9]/g, "_");
  pdf.save(`A-SAFE_Site_Survey_${safeName}_${new Date().toISOString().split("T")[0]}.pdf`);
}
