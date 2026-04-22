// Extract the A-SAFE Product Maintenance guide
// (ASAFE_ProductMaintenance_PRH-1001-A-SAFE-26022024-2 1.pdf) into a structured
// JSON payload that the /admin/ingest-maintenance-data endpoint can read and
// apply to products.maintenance_data.
//
// The source PDF is a *generic* maintenance document — it covers four product
// families (Memaplex barriers, Monoplex barriers, RackGuard, Traffic Gates)
// plus universal guidance. There is no per-SKU breakdown in the PDF. We model
// this as:
//   - one "global" entry that applies to every product (recurring inspection /
//     fixings / pins & caps advice),
//   - four per-family entries whose `appliesToFamilies` / `appliesToCategories`
//     array names the prefix / category keyword that matches products in the
//     ingest step.
//
// Usage:
//   node scripts/extractProductMaintenancePdf.mjs > scripts/data/product-maintenance.json

import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const PDF_PATH =
  '/Users/thomaschilds/Downloads/wetransfer_engage_2026-04-22_0548/ASAFE_ProductMaintenance_PRH-1001-A-SAFE-26022024-2 1.pdf';

const doc = await getDocument({ url: `file://${PDF_PATH}` }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const p = await doc.getPage(i);
  const tc = await p.getTextContent();
  const text = tc.items
    .map((it) => it.str)
    // PDF extraction sometimes loses ligatures — `ixings`/`ix`/`iltration`
    // should read as `fixings`/`fix`/`filtration`. Fix the common ones we
    // observed in the source.
    .join(' ')
    .replace(/\bix\b/g, 'fix')
    .replace(/\bixings\b/g, 'fixings')
    .replace(/\bittings\b/g, 'fittings')
    .replace(/\bigure\b/g, 'figure')
    .replace(/\bluoride\b/g, 'fluoride')
    .replace(/\bSatd\.\b/g, 'Saturated')
    .replace(/\biltration\b/g, 'filtration')
    .replace(/\biniltrating\b/g, 'infiltrating')
    .replace(/\bTraic\b/g, 'Traffic')
    .replace(/\bspeciic\b/g, 'specific')
    .replace(/\blite\b/g, 'light')
    .replace(/\blitespan\b/g, 'lifespan')
    .replace(/\breduced lifespan\b/g, 'reduced lifespan')
    .replace(/\bLiquiied\b/g, 'Liquified')
    .replace(/\bSulide\b/gi, 'Sulfide')
    .replace(/\bSulite\b/gi, 'Sulfite')
    .replace(/\bluorine\b/gi, 'fluorine')
    .replace(/\bPhosphoric\b/g, 'Phosphoric')
    .replace(/\bFutural\b/g, 'Furfural');
  pages.push(text);
}

// ─── Universal content ──────────────────────────────────────
// Applies to every product — inspection cadence & pins/caps/base-plate
// fixings checks.
const universalInspection = 'annual'; // "every 12 months" for base plate fixings
const universalInspectionNote =
  'Base plate fixings: check torque setting every 12 months, or sooner if an impact has occurred. ' +
  'Pins & caps: check regularly for loosening from general use and cleaning — remove pin covers and retighten with the A-SAFE tool.';

// ─── Memaplex barriers (iFlex, FlexiShield, RackGuard Plus base) ──────
const memaplexCleaning =
  'Internal: warm water + kitchen cleaner on a non-abrasive cloth; wipe each rail and post, remove all dust/dirt ' +
  'from fixing points, then wipe dry. External: use a jet wash to lift stubborn dirt, then a stronger rubber-suited ' +
  'detergent on marked areas (see A-SAFE chemical-resistance list, pages 7–9 of PRH-1001). Never leave water pooled ' +
  'in fixing points. Full risk assessment before cleaning; gloves and eye protection throughout; dispose of waste ' +
  'water per national regulations.';

// ─── Monoplex barriers (posts, bollards) ───────────────────
const monoplexCleaning =
  'Warm water + kitchen cleaner on a non-abrasive cloth for each post. Remove all dust/dirt from fixing points ' +
  'and wipe dry — never leave water pooled at fixings. Refer to the A-SAFE chemical-resistance list (pages 10–11 ' +
  'of PRH-1001). Full risk assessment before cleaning; gloves and eye protection throughout; dispose of waste ' +
  'water per national regulations.';

// ─── Barrier damage checklist (applies to all rail+post barrier systems) ─
const barrierDamageAssessment = [
  'Rail alignment: rail and coupling cover out of alignment — indicative of a reasonable-energy impact or repeated low-level impacts. If any further indicators are present, replace the affected section; otherwise inspect coupling, sleeve, rail pin, post pin and post in depth.',
  'Light areas (post/rail whitening): material has been taken beyond its elastic limit. At least one reasonable-energy impact, or many lower-energy ones. Continuous inspection of the area recommended.',
  'Crease markings: fatigue from repeated reasonable-energy impacts. Replace any section showing this — overall integrity is compromised.',
  'Rail area lightening (between rail pin and post): repeated medium-energy impacts. Full guardrail inspection; replace affected parts.',
  'Inner layer deformation: inner rail material visible around the coupling sleeve on the exterior — near-maximum-energy impact. Replace the affected system.',
  'Base deformation: base deformed / fixings pulling out of the ground — near-maximum-energy impact. Replace the affected system.',
  'Cracking: cracks anywhere in the system — severe damage events, integrity negated. Replace the affected parts.',
  'Scratches and scrapes: deep scratches from light collisions with vehicles or pallets. Monitor quantity and outer shape — if any crack appears, replace the product.',
];

// ─── RackGuard damage checklist ────────────────────────────
const rackGuardDamageAssessment = [
  'Scuff damage: minor black marks from low-energy impacts (truck wheels, pallets, palletised loads). No further inspection or removal required.',
  'Light scrape / light gouge: shallow groove from low-energy metal-contact impacts (truck fork, sharp edge, load). General inspection of rack leg; RackGuard can stay in place.',
  'Heavy gouge mark: deep groove from higher-energy metal-contact impact. General inspection of rack leg; RackGuard must be removed and replaced.',
  'Cracking & splitting: split in the material from high-energy, high-speed impact. General inspection of rack leg; RackGuard must be removed and replaced.',
];

// ─── Traffic Gate damage / maintenance ─────────────────────
const trafficGateDamageAssessment = [
  'Regular re-tightening of fixings in key areas of the Traffic Gate — fixings may loosen over time and cause operational issues.',
  'Inspect latches, hinges and pivots for wear and free movement.',
  'Check that the gate swings/slides through its full range without binding.',
];

const warrantyConditions =
  'A-SAFE disclaims all liability for injuries or ill health sustained during cleaning, maintenance or the use of ' +
  'chemical substances. Users are responsible for following proper safety procedures and using appropriate protective ' +
  'measures. Consult Safety Data Sheets (SDS) and Technical Data Sheets (TDS) from chemical suppliers before using any ' +
  'cleaning product on A-SAFE polymer. Product integrity warranties assume the inspection and cleaning cadence described ' +
  'in this document has been followed; damaged components (crease marks, cracks, base deformation, inner-layer deformation) ' +
  'must be replaced rather than repaired to preserve system integrity.';

const recommendedSparesBarrier = [
  'Rail pins',
  'Post pins',
  'Pin caps',
  'Couplings / coupling sleeves',
  'Base plate fixings (to factory torque spec)',
  'Replacement rail sections (for creased / cracked rails)',
  'Replacement post sections (for cracked / lightened posts)',
];

const recommendedSparesRackGuard = [
  'Replacement RackGuard units (for heavy-gouge or cracked units)',
  'RackGuard fixings',
];

const recommendedSparesTrafficGate = [
  'Gate latches',
  'Hinges / pivot fixings',
  'Replacement fixings (to factory torque spec)',
];

// Pull the raw page text per family so the admin/debug UI (and any downstream
// auditor) can see exactly what was extracted without re-running pdfjs.
const rawByFamily = {
  memaplex: pages[4] || '', // page 5 — Memaplex cleaning
  monoplex: pages[5] || '', // page 6 — Monoplex cleaning
  rackGuard: pages[13] || '', // page 14 — RackGuard damage
  trafficGate: pages[2] || '', // page 3 — Traffic Gate maintenance
  barrierDamageA: pages[11] || '', // page 12 — barrier damage part 1
  barrierDamageB: pages[12] || '', // page 13 — barrier damage part 2
};

const dataset = {
  _meta: {
    source: 'ASAFE_ProductMaintenance_PRH-1001-A-SAFE-26022024-2 1.pdf',
    docRef: 'PRH1001ASAFE260220242',
    docTitle: 'Product Maintenance',
    docVersion: 'Version 2 - February 2024',
    dateCreated: 'August 2023',
    authors: ['Matthew Briggs', 'Jerry Budby'],
    numPages: doc.numPages,
    extractedAt: new Date().toISOString(),
    // The PDF is generic (not per-SKU). The ingest endpoint will merge the
    // `global` entry into every product and each family entry into products
    // whose name / category matches one of the `appliesTo*` hints.
    shape: 'global-plus-family-overlay',
  },
  products: [
    {
      productName: '__GLOBAL__',
      global: true,
      appliesToFamilies: ['*'],
      inspectionFrequency: universalInspection,
      inspectionNotes: universalInspectionNote,
      cleaningInstructions:
        'Regular cleaning reduces dirt and debris infiltrating crucial mechanical parts; lack of cleaning may shorten ' +
        'product lifespan and cause component failures. Carry out a full risk assessment before cleaning; wear gloves ' +
        'and eye protection; dispose of waste water per national regulations.',
      damageAssessment: [
        'Check base plate fixing torque every 12 months — or immediately after any known impact.',
        'Remove pin covers periodically and retighten pins with the A-SAFE tool if they have loosened.',
      ],
      warrantyConditions,
      recommendedSpares: [
        'Pin caps',
        'Pins (rail + post)',
        'Base plate fixings',
      ],
      rawText:
        (pages[2] || '').slice(0, 2000), // page 3 has the universal barrier/TG advice
    },
    {
      productName: 'Memaplex Barrier Family',
      global: false,
      appliesToFamilies: ['iFlex', 'FlexiShield', 'ShieldRail'],
      appliesToCategoryKeywords: ['barrier', 'guardrail'],
      inspectionFrequency: universalInspection,
      inspectionNotes: universalInspectionNote,
      cleaningInstructions: memaplexCleaning,
      damageAssessment: barrierDamageAssessment,
      warrantyConditions,
      recommendedSpares: recommendedSparesBarrier,
      rawText: rawByFamily.memaplex.slice(0, 2000),
    },
    {
      productName: 'Monoplex Barrier Family',
      global: false,
      appliesToFamilies: ['Memaplex Post', 'Monoplex', 'Atlas', 'Bollard'],
      appliesToCategoryKeywords: ['bollard', 'post'],
      inspectionFrequency: universalInspection,
      inspectionNotes: universalInspectionNote,
      cleaningInstructions: monoplexCleaning,
      damageAssessment: barrierDamageAssessment,
      warrantyConditions,
      recommendedSpares: recommendedSparesBarrier,
      rawText: rawByFamily.monoplex.slice(0, 2000),
    },
    {
      productName: 'RackGuard Family',
      global: false,
      appliesToFamilies: ['RackGuard', 'Rack End Barrier', 'RackEye'],
      appliesToCategoryKeywords: ['rack'],
      inspectionFrequency: universalInspection,
      inspectionNotes: universalInspectionNote,
      cleaningInstructions: monoplexCleaning, // Monoplex-style material
      damageAssessment: rackGuardDamageAssessment,
      warrantyConditions,
      recommendedSpares: recommendedSparesRackGuard,
      rawText: rawByFamily.rackGuard.slice(0, 2000),
    },
    {
      productName: 'Traffic Gate Family',
      global: false,
      appliesToFamilies: ['Traffic Gate', 'Pedestrian Gate', 'Swing Gate', 'Slide Gate'],
      appliesToCategoryKeywords: ['gate'],
      inspectionFrequency: 'quarterly',
      inspectionNotes:
        'Re-tighten fixings in key areas of the Traffic Gate regularly — fixings may loosen with day-to-day use and ' +
        'cause operational issues. Check base plate torque at least every 12 months or sooner after any impact.',
      cleaningInstructions: memaplexCleaning,
      damageAssessment: [...trafficGateDamageAssessment, ...barrierDamageAssessment],
      warrantyConditions,
      recommendedSpares: recommendedSparesTrafficGate,
      rawText: rawByFamily.trafficGate.slice(0, 2000),
    },
  ],
};

process.stdout.write(JSON.stringify(dataset, null, 2));
