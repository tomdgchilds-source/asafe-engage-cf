// Parse the 47-page A-SAFE Product Impact Suitability master document into a
// structured per-product JSON record. The PDF is image-heavy (traffic-light
// suitability icons are raster, not text), so all we can recover
// deterministically from the PDF text stream is:
//   - Product name (page title)
//   - Post diameter
//   - Rail diameter (where applicable — bollards/bumpers have no rail)
//   - Impact zone (mm range)
//   - Impact-angle scope (45° + 90°  vs  90°-only — bollards are 90°-only)
//
// The actual vehicle×angle suitability matrix and the Joule KE values are NOT
// in the text stream (icons + outside-of-this-doc PAS 13 certs). So this
// dataset is complementary to ι's cert-impact-patch.json, not a competitor:
// we add geometry + angle-scope metadata, ι adds absorbed-energy in Joules.
//
// Usage:  node scripts/parseImpactTestingMaster.mjs
//
// Reads /tmp/impact-testing-raw.txt (produced by extractImpactTestingPdf.mjs)
// and writes scripts/data/product-impact-testing.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RAW = "/tmp/impact-testing-raw.txt";
const OUT = path.join(__dirname, "data", "product-impact-testing.json");

const text = fs.readFileSync(RAW, "utf8");
const pageBlocks = text.split(/^--- page (\d+) ---$/m);
const pages = [];
for (let i = 1; i < pageBlocks.length; i += 2) {
  pages.push({ pageNum: Number(pageBlocks[i]), body: pageBlocks[i + 1] || "" });
}

// Canonical product list from the TOC on page 3 — these are the titles we
// expect to find on product pages 4..46 (in this order). Note: the TOC
// entry "Cold Storage Single RackEnd Barrier" has no dedicated page in the
// PDF (the 6 RackEnd pages 29-34 are ambient-temp only), so it's omitted.
const EXPECTED_PRODUCTS = [
  "iFlex Pedestrian Barrier 3 Rail",
  "mFlex Single Traffic Barrier Ground Level",
  "mFlex Single Traffic Barrier",
  "mFlex Double Traffic Barrier",
  "eFlex Single Traffic Barrier",
  "iFlex Single Traffic Barrier",
  "iFlex Double Traffic Barrier",
  "Atlas Double Traffic Barrier",
  "Atlas Triangle Traffic Barrier",
  "Atlas Polygon Traffic Barrier",
  "eFlex Single Traffic Barrier+",
  "iFlex Single Traffic Barrier+",
  "iFlex Double Traffic Barrier+",
  "Atlas Double Traffic Barrier+",
  "Heavy Duty Topple Barrier",
  "ForkGuard",
  "Heavy Duty ForkGuard",
  "Step Guard",
  "iFlexRail Column Guard",
  "iFlexRail Column Guard+",
  "iFlex Dock Gate",
  "iFlex Dock Gate XL",
  "eFlex Dock Gate",
  "Traffic Gate",
  "iFlex Height Restrictor",
  "eFlex Single RackEnd Barrier",
  "eFlex Single RackEnd Barrier with ForkGuard",
  "eFlex Double RackEnd Barrier",
  "eFlex Double RackEnd Barrier with ForkGuard",
  "iFlex Single RackEnd Barrier",
  "iFlex Single RackEnd Barrier with ForkGuard",
  "eFlex Cold Storage ForkGuard Barrier",
  "iFlex Cold Storage Pedestrian Barrier 3 Rail",
  "iFlex Cold Storage Single Traffic Barrier",
  "iFlex Cold Storage Single Traffic Barrier+",
  "iFlex Cold Storage Bollard",
  "iFlex Cold Storage Height Restrictor",
  "iFlex Bollard",
  "iFlex Heavy Duty Bollard",
  "Monoplex Bollard 130",
  "Monoplex Bollard 190",
  "Vehicle Impact & Anti-climb Car Park Barrier",
  "iFlex Single Car Park Barrier",
];

// Product-page detector. A product page always contains the "Certification"
// and "Specification guidance" labels and the per-page spec triplet
// "Post Diameter" / "Rail Diameter" / "Impact Zone". Pages 1-3 and 47 don't.
function isProductPage(body) {
  return (
    /Specification guidance/.test(body) &&
    /Impact Zone/.test(body) &&
    /Vehicle\s+Type/.test(body)
  );
}

// Extract dimensions from a product page. The PDF emits the label triplet
// (Post Diameter / Rail Diameter / Impact Zone) first, then a long block of
// disclaimer paragraph text, then the three numeric values in the SAME
// ORDER as the labels, then the product name. Values aren't anchored next
// to their labels; they're positional. So we collect every label-looking
// line (in order) and every value-looking line (numeric, no English words,
// short) and zip them by index.
//
// Bollard pages have only 2 labels (Post Diameter + Impact Zone — no rail).
// ForkGuard pages use "ForkGuard Height" + "Impact Zone".
// The Bollard page on p39 (Cold Storage) uses "Bollard Height" + "Impact Zone".
function extractSpecs(body) {
  const specs = {
    postDiameter: null,
    railDiameter: null,
    impactZone: null,
    forkGuardHeight: null,
    bollardHeight: null,
  };

  // Cut everything from the suitability table onward — that block has the
  // per-vehicle weight/speed numbers we don't want to mistake for spec values.
  const head = body.split(/Vehicle\s+Type/)[0] || "";
  const lines = head
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Pass 1: collect ordered labels (one entry per dimension label, in document
  // order). Their order on the page determines the order of the value lines.
  const labelOrder = [];
  for (const l of lines) {
    if (/^Post Diameter\s*-/i.test(l)) labelOrder.push("postDiameter");
    else if (/^Rail Diameter\s*-/i.test(l)) labelOrder.push("railDiameter");
    else if (/^Impact Zone\s*-/i.test(l)) labelOrder.push("impactZone");
    else if (/^ForkGuard Height\s*-/i.test(l)) labelOrder.push("forkGuardHeight");
    else if (/^Bollard Height\s*-/i.test(l)) labelOrder.push("bollardHeight");
  }

  // Pass 2: collect candidate value lines — numeric-looking, short, no run
  // of 4+ letters in a row (so paragraph text is excluded), and not a label.
  const values = [];
  for (const l of lines) {
    if (
      /^Post Diameter|^Rail Diameter|^Impact Zone|^Certification|^Specification|^Application|^ForkGuard Height|^Bollard Height|^Product is supplied/i.test(
        l,
      )
    ) {
      continue;
    }
    if (!/[0-9]/.test(l)) continue;
    if (/[A-Za-z]{4,}/.test(l)) continue;
    if (l.length > 60) continue;
    values.push(l);
  }

  // Some pages emit each value as TWO lines (mm half then "/" then inches half
  // on the next line — pdfjs splits on the y-coord drop). Join consecutive
  // value lines when the first lacks a "/" but the second has one.
  const merged = [];
  for (let i = 0; i < values.length; i++) {
    const cur = values[i];
    const nxt = values[i + 1];
    if (cur && nxt && !cur.includes("/") && nxt.includes("/")) {
      merged.push(`${cur} / ${nxt}`);
      i++;
    } else if (
      cur &&
      nxt &&
      /^\d+\s*-?\s*\d*\s*$/.test(cur) &&
      /^\d/.test(nxt) &&
      !cur.includes("/")
    ) {
      // Numeric range pair like "0 - 1175" / "0 - 46¼"
      merged.push(`${cur} / ${nxt}`);
      i++;
    } else {
      merged.push(cur);
    }
  }

  for (let i = 0; i < labelOrder.length; i++) {
    if (i < merged.length) {
      specs[labelOrder[i]] = merged[i];
    }
  }

  return specs;
}

// Determine whether the page's impact-angle header is "45° 90°" or "90°"
// alone (bollards are 90°-only in the document).
function extractAngleScope(body) {
  const hasBoth = /45[°˚]\s*90[°˚]/.test(body) || /45.{0,3}90/.test(body);
  const has90 = /90[°˚]/.test(body);
  const has45 = /45[°˚]/.test(body);
  if (hasBoth || (has90 && has45)) return "45+90";
  if (has90) return "90-only";
  if (has45) return "45-only";
  return null;
}

// Find which expected product name is on the page. The PDF mangles a few
// glyphs out of the text stream:
//   - The "ffi" ligature is in a private-use code page → "Tra<ctrl>ic"
//   - The "&" is rendered as the word "and"
//   - p39 prints "Cold Storage Bollard" without the iFlex prefix
function fold(s) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    // Insert "ff" between a letter and a control byte that precedes "i" —
    // recovers "Traffic" from "Tra<ctrl>ic" without doubling the "i".
    .replace(/([a-z])[\x00-\x1f]+(?=i)/gi, "$1ff")
    .replace(/[\x00-\x1f]+/g, " ")
    .replace(/\+/g, " plus")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchProductName(body) {
  const folded = fold(body);
  // Pull just the title region — the on-page title sits BEFORE the
  // suitability table ("Vehicle Type" header). Restricting to the title zone
  // avoids false matches on cross-product disclaimer text (e.g. ForkGuard /
  // Step Guard mentions on every barrier page).
  const vehIdx = folded.indexOf("vehicle type");
  const titleZone = vehIdx > 0 ? folded.slice(0, vehIdx) : folded;

  const candidates = [...EXPECTED_PRODUCTS].sort((a, b) => b.length - a.length);
  for (const name of candidates) {
    const needle = fold(name);
    if (titleZone.includes(needle)) return name;
  }
  // Two pages drop the iFlex prefix from the title; handle them by literal
  // suffix lookup so we don't accidentally match "Dock Gate" (eFlex page)
  // against "iFlex Dock Gate".
  if (titleZone.includes(fold("Cold Storage Bollard"))) {
    return "iFlex Cold Storage Bollard";
  }
  if (titleZone.includes(fold("Cold Storage Single RackEnd Barrier"))) {
    return "Cold Storage Single RackEnd Barrier";
  }
  return null;
}

const products = [];
const unmatchedPages = [];
for (const p of pages) {
  if (!isProductPage(p.body)) continue;
  const name = matchProductName(p.body);
  if (!name) {
    unmatchedPages.push(p.pageNum);
    continue;
  }
  const specs = extractSpecs(p.body);
  const angleScope = extractAngleScope(p.body);
  products.push({
    pageNum: p.pageNum,
    name,
    postDiameter: specs.postDiameter,
    railDiameter: specs.railDiameter,
    impactZone: specs.impactZone,
    forkGuardHeight: specs.forkGuardHeight,
    bollardHeight: specs.bollardHeight,
    impactAngleScope: angleScope,
    // The suitability document doesn't quote a test method; the PAS 13
    // certs do. Leave null so ι's cert-impact-patch.json is authoritative.
    testMethod: null,
  });
}

const extractedNames = new Set(products.map((p) => p.name));
const missingFromToc = EXPECTED_PRODUCTS.filter((n) => !extractedNames.has(n));

const out = {
  _description:
    "A-SAFE Product Impact Suitability master document (PRH-1012, May 2024). Parsed from the 47-page PDF via pdfjs-dist. Each product row captures the physical dimensions (post diameter, rail diameter where applicable, impact zone in mm) and the impact-angle scope (45°+90° for most products; 90°-only for bollards). The per-vehicle traffic-light suitability matrix is encoded as raster icons in the PDF and is therefore NOT parsed here — it has to be read from the PDF directly. Joule absorbed-energy values live in the PAS 13 certificates (see cert-impact-patch.json from ι), not in this document; reconcile master-testing-patch.json with cert-impact-patch.json for the combined per-product dataset.",
  sourcePdf:
    "ASAFE_ProductImpactTesting_PRH-1012-A-SAFE-30012024-1.pdf (47 pages, May 2024 v1)",
  documentReference: "PRH-1012-A-SAFE-30012024-1",
  author: "Matthew Briggs",
  checkedBy: "Jerry Budby / Mark Bonner",
  approvedBy: "Ben Allen",
  revision: "Version 1 - May 2024",
  tocProductCount: EXPECTED_PRODUCTS.length,
  extractedCount: products.length,
  missingFromToc,
  unmatchedPages,
  products,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(
  `Wrote ${products.length} products (TOC ${EXPECTED_PRODUCTS.length}) to ${OUT}`,
);
if (missingFromToc.length > 0) {
  console.log("Missing from TOC:", missingFromToc.join(", "));
}
if (unmatchedPages.length > 0) {
  console.log("Unmatched product pages:", unmatchedPages.join(", "));
}
