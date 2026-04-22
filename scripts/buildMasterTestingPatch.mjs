// Reconcile the parsed master Impact Suitability dataset
// (product-impact-testing.json) with ι's PAS 13 cert patches
// (cert-impact-patch.json) and emit master-testing-patch.json.
//
// Reconciliation rules per task:
//   - If ι has a Joule value AND ν (the master doc) doesn't publish a Joule
//     value, take ι's. The master suitability PDF prints zero Joule numbers
//     in its text stream — they live only in the certs — so ι is
//     authoritative for impact_rating / pas_13_test_joules / pas_13_method
//     wherever the cert family overlaps a TOC product.
//   - If ν has metadata that ι doesn't (post diameter, rail diameter, impact
//     zone, angle scope), add it as enrichment fields on the patch.
//   - Any conflict (very rare here, since the two datasets cover disjoint
//     fields) — prefer ι, log ν's value into `notes` for audit.
//   - Don't drop products that the master doc covers but the cert doesn't —
//     emit them with no Joule (impact_rating untouched on apply) and just
//     the spec metadata.
//
// We DO NOT overwrite cert-impact-patch.json. Output path:
// scripts/data/master-testing-patch.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MASTER_PATH = path.join(__dirname, "data", "product-impact-testing.json");
const CERT_PATH = path.join(__dirname, "data", "cert-impact-patch.json");
const OUT_PATH = path.join(__dirname, "data", "master-testing-patch.json");

const master = JSON.parse(fs.readFileSync(MASTER_PATH, "utf8"));
const cert = JSON.parse(fs.readFileSync(CERT_PATH, "utf8"));

// Map from ι's PAS 13 class familyName → the master-doc product names that
// share that impact class. Mirrors κ's certificate-manifest.json mapping
// from cert → product-family-id.
const CERT_TO_MASTER_NAMES = {
  "130-T0-P3": [
    "iFlex Pedestrian Barrier 3 Rail",
    "iFlex Cold Storage Pedestrian Barrier 3 Rail",
  ],
  "190-T1-P0": [
    "iFlex Single Traffic Barrier",
    "iFlex Single Traffic Barrier+",
    "iFlex Double Traffic Barrier",
    "iFlex Double Traffic Barrier+",
    "iFlex Cold Storage Single Traffic Barrier",
    "iFlex Cold Storage Single Traffic Barrier+",
  ],
  "190-T2-P0": [
    "Atlas Double Traffic Barrier",
    "Atlas Double Traffic Barrier+",
    "Atlas Triangle Traffic Barrier",
    "Atlas Polygon Traffic Barrier",
  ],
  "190-T1-P2": ["iFlex Pedestrian Barrier 3 Rail"],
  "190-T2-P1": ["iFlex Pedestrian Barrier 3 Rail"],
  "Step Guard": ["Step Guard"],
  "Bollard Bumper": [
    // Bollard Bumper is a 190mm low-level accessory — the master doc lists
    // individual bollard families. Apply the cert's 5700J Zone-4 absorbed
    // energy to all bollard families that share the bumper diameter.
    "iFlex Bollard",
    "iFlex Heavy Duty Bollard",
    "Monoplex Bollard 130",
    "Monoplex Bollard 190",
    "iFlex Cold Storage Bollard",
  ],
  "Traffic Gate": ["Traffic Gate"],
  "RackGuard - Multiple height and profile sizes": [
    // EN 15512/15635 cert — no Joule. Master doc doesn't list a "RackGuard"
    // product (the RackEnd Barriers are different). No mapping; ι's patch
    // already handles this case (test-method only update).
  ],
};

// Build cert-side per-master-name overrides. If two cert classes hit the
// same master-doc product (e.g. iFlex Ped 3 Rail is referenced by 3 certs),
// prefer the highest joule — that represents the most-specific (highest
// load-class) PAS 13 certification the family achieved.
const certByMasterName = new Map();
for (const c of cert.patches || []) {
  const masters = CERT_TO_MASTER_NAMES[c.familyName] || [];
  for (const masterName of masters) {
    const existing = certByMasterName.get(masterName);
    if (!existing) {
      certByMasterName.set(masterName, c);
    } else {
      const a = existing.newValue ?? -1;
      const b = c.newValue ?? -1;
      if (b > a) certByMasterName.set(masterName, c);
    }
  }
}

const enriched = [];
const reconciliation = {
  agreed: [],
  certWon: [],
  masterOnly: [],
  certOnly: [],
  bothNull: [],
};

for (const m of master.products) {
  const c = certByMasterName.get(m.name);
  const certJoule = c?.newValue ?? null;
  // The master doc never publishes Joules in its text stream. So ν.value is
  // always null for impactRating; ν only contributes geometry+angle metadata.
  const masterJoule = null;

  let chosenJoule = null;
  let outcome = "bothNull";
  if (certJoule != null && masterJoule != null) {
    outcome = certJoule === masterJoule ? "agreed" : "certWon";
    chosenJoule = certJoule;
  } else if (certJoule != null) {
    outcome = "certOnly";
    chosenJoule = certJoule;
  } else if (masterJoule != null) {
    outcome = "masterOnly";
    chosenJoule = masterJoule;
  }

  reconciliation[outcome].push(m.name);

  const noteParts = [`Source: ${master.sourcePdf} (page ${m.pageNum})`];
  if (c) {
    noteParts.push(
      `Cert family: ${c.familyName}; ${c.notes?.split(".")[0] || "PAS 13 cert"}.`,
    );
  }
  if (outcome === "certWon") {
    noteParts.push(
      `Reconciliation: cert ${c.newValue}J overrode master ${masterJoule}J (cert is the more specific PAS 13 source).`,
    );
  } else if (outcome === "agreed") {
    noteParts.push(`Reconciliation: master and cert agreed on ${chosenJoule}J.`);
  } else if (outcome === "certOnly") {
    noteParts.push(
      `Reconciliation: master doc publishes no Joule; using cert ${chosenJoule}J.`,
    );
  } else if (outcome === "masterOnly") {
    noteParts.push(
      `Reconciliation: no PAS 13 cert covers this product family yet; master doc value used.`,
    );
  } else {
    noteParts.push(`Reconciliation: no Joule on either side; metadata-only patch.`);
  }

  enriched.push({
    familyName: m.name,
    productUrl: null,
    status: outcome,
    currentValue: null, // looked up at apply time, not parsed here
    newValue: chosenJoule,
    impactRatingRaw: c?.impactRatingRaw || null,
    vehicleTest: c?.vehicleTest || null,
    pas13Certified: c?.pas13Certified ?? null,
    pas13Method: c?.pas13Method || null,
    masterPostDiameter: m.postDiameter,
    masterRailDiameter: m.railDiameter,
    masterImpactZone: m.impactZone,
    masterForkGuardHeight: m.forkGuardHeight,
    masterBollardHeight: m.bollardHeight,
    masterImpactAngleScope: m.impactAngleScope,
    masterPageNum: m.pageNum,
    notes: noteParts.join(" | "),
  });
}

const masterNames = new Set(master.products.map((p) => p.name));
const certOnlyOrphans = [];
for (const c of cert.patches || []) {
  const targets = CERT_TO_MASTER_NAMES[c.familyName] || [];
  if (targets.length === 0 || !targets.some((t) => masterNames.has(t))) {
    certOnlyOrphans.push(c.familyName);
  }
}

const out = {
  _description:
    "Reconciled per-product impact dataset. Joule values come from ι's cert-impact-patch.json (PAS 13 / EN test certificates — authoritative for absorbed energy). Spec geometry and impact-angle scope come from ν's product-impact-testing.json (parsed from the 47-page Product Impact Suitability master PDF). Conflict policy: cert wins on Joules; master adds geometry. The two datasets are largely orthogonal (the master PDF doesn't print Joules in its text stream), so most entries are 'certOnly' (Joule from cert + metadata from master) or 'bothNull' (no PAS 13 cert exists for that family — geometry only).",
  generatedAt: new Date().toISOString(),
  source:
    "Reconciled: cert-impact-patch.json (ι) + product-impact-testing.json (ν)",
  reconciliationSummary: {
    masterDocProductsCount: master.products.length,
    certPatchesCount: (cert.patches || []).length,
    agreed: reconciliation.agreed.length,
    certWon: reconciliation.certWon.length,
    masterOnly: reconciliation.masterOnly.length,
    certOnly: reconciliation.certOnly.length,
    bothNull: reconciliation.bothNull.length,
    certOnlyOrphans,
  },
  patches: enriched,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
console.log("Wrote master-testing-patch.json:");
console.log(`  patches: ${enriched.length}`);
console.log(`  agreed: ${reconciliation.agreed.length}`);
console.log(`  certWon: ${reconciliation.certWon.length}`);
console.log(`  masterOnly: ${reconciliation.masterOnly.length}`);
console.log(`  certOnly: ${reconciliation.certOnly.length}`);
console.log(`  bothNull: ${reconciliation.bothNull.length}`);
console.log(
  `  certOnlyOrphans (in ι, no ν page): ${certOnlyOrphans.join(", ") || "(none)"}`,
);
