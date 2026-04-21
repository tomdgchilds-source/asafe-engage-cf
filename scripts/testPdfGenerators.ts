/**
 * Node test harness for the two client-side PDF generators. Sets up a JSDOM
 * browser environment, shims fetch to return local/mock data, patches
 * jsPDF.save() to write to /tmp/ instead of triggering a browser download,
 * then runs six scripted scenarios through the real generator modules.
 *
 * Run with:
 *   cd /Users/thomaschilds/asafe-engage-cf
 *   npx tsx --import ./scripts/testPdfGenerators.loaderInstall.mjs scripts/testPdfGenerators.ts
 *
 * or, simpler, the package.json test:pdf script wraps it all.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { JSDOM } from "jsdom";

// ─────────────────────────────────────────────────────────────────────────
// 1. JSDOM boot — install everything the generators poke at
// ─────────────────────────────────────────────────────────────────────────
const dom = new JSDOM(
  "<!DOCTYPE html><html><head></head><body></body></html>",
  {
    url: "http://localhost:8788/",
    pretendToBeVisual: true,
    runScripts: "outside-only",
  },
);
const { window } = dom;

// Copy window globals onto globalThis so modules that read from globalThis
// (jspdf build does this) see a browser-shaped environment.
const GLOBAL_KEYS = [
  "window",
  "document",
  "navigator",
  "location",
  "HTMLElement",
  "HTMLCanvasElement",
  "HTMLAnchorElement",
  "HTMLImageElement",
  "Image",
  "Blob",
  "File",
  "FileReader",
  "FormData",
  "URL",
  "URLSearchParams",
  "XMLHttpRequest",
  "Event",
  "CustomEvent",
  "atob",
  "btoa",
  "getComputedStyle",
  "DOMParser",
] as const;

for (const key of GLOBAL_KEYS) {
  const value = (window as any)[key];
  if (value !== undefined) {
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  }
}

// URL.createObjectURL — JSDOM doesn't implement it. jspdf's browser-ish
// saveAs only runs when we don't override save(), but some internals
// (Blob handling) still hit it.
if (!("createObjectURL" in (globalThis.URL as any))) {
  (globalThis.URL as any).createObjectURL = (_blob: Blob) => "blob:stub";
  (globalThis.URL as any).revokeObjectURL = () => {};
}

// Stubs for globals pdfjs-dist pokes at on import. We never actually render
// a PDF through pdfjs in the harness (layoutDrawings are only fed as image
// fileTypes), so the stubs just need to be constructable — they don't need
// to do math.
class StubDOMMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(_init?: unknown) {}
  multiply() { return this; }
  translate() { return this; }
  scale() { return this; }
  invertSelf() { return this; }
}
if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = StubDOMMatrix;
if (!(globalThis as any).DOMPoint) (globalThis as any).DOMPoint = class { x=0;y=0;z=0;w=0; };
if (!(globalThis as any).Path2D) (globalThis as any).Path2D = class {};
if (!(globalThis as any).ImageData) {
  (globalThis as any).ImageData = class { width: number; height: number; data: Uint8ClampedArray;
    constructor(w: number, h: number) { this.width=w; this.height=h; this.data = new Uint8ClampedArray(w*h*4); }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Mock fetch. Routes:
//   - /api/products?...           → /tmp/live-products.json (or empty array)
//   - /api/layout-drawings/:id    → mock raster layout
//   - /api/objects/*              → tiny 1x1 PNG (user-uploaded image)
//   - webcdn.asafe.com/*          → slightly bigger yellow PNG
//   - anything else               → 1x1 PNG
// ─────────────────────────────────────────────────────────────────────────

// 1×1 transparent PNG
const PNG_1X1_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// 16×16 yellow PNG (hand-constructed so at least something renders). This
// hex was generated with a one-off Python snippet and committed inline so
// the harness has no runtime prerequisite on an image encoder.
const PNG_16X16_YELLOW_BYTES = (() => {
  // PNG signature + IHDR + IDAT + IEND for a solid yellow 16×16.
  // Simpler: reuse a deflate-compressed static blob we prebuild via
  // zlib at harness start (no runtime dep on a graphics lib).
  const width = 16;
  const height = 16;
  // Raw pixel data: width*3 RGB bytes per row, each prefixed with a filter byte (0).
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = 0xff; // R
    row[2 + x * 3] = 0xc7; // G (A-SAFE yellow)
    row[3 + x * 3] = 0x2c; // B
  }
  const raw = Buffer.concat(Array(height).fill(row));
  const idatData = deflateSync(raw);

  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
})();

const CATALOG_FILE = "/tmp/live-products.json";
let CATALOG_CACHE: any = undefined;
async function loadLocalCatalog(): Promise<any> {
  if (CATALOG_CACHE !== undefined) return CATALOG_CACHE;
  try {
    if (existsSync(CATALOG_FILE)) {
      const txt = await readFile(CATALOG_FILE, "utf8");
      const parsed = JSON.parse(txt);
      CATALOG_CACHE = Array.isArray(parsed)
        ? { products: parsed }
        : parsed;
    } else {
      CATALOG_CACHE = { products: [] };
    }
  } catch (err) {
    console.warn("[harness] failed to read local catalog:", err);
    CATALOG_CACHE = { products: [] };
  }
  return CATALOG_CACHE;
}

function makeResponse(
  body: Buffer | string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const { status = 200, headers = {} } = init;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  // JSDOM's Response constructor accepts a Uint8Array so we can wrap the
  // buffer directly. Fall back to manually synthesising the relevant
  // surface area when Response isn't available under jsdom.
  const ResponseCtor = (globalThis as any).Response || undefined;
  if (ResponseCtor) {
    try {
      return new ResponseCtor(new Uint8Array(buf), { status, headers });
    } catch {
      // fall through to manual shim
    }
  }
  // Minimal Response shim.
  const shim: any = {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        const k = Object.keys(headers).find(
          (h) => h.toLowerCase() === name.toLowerCase(),
        );
        return k ? headers[k] : null;
      },
    },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    blob: async () => new (globalThis as any).Blob([new Uint8Array(buf)], { type: headers["content-type"] || "application/octet-stream" }),
    json: async () => JSON.parse(buf.toString("utf8")),
    text: async () => buf.toString("utf8"),
  };
  return shim;
}

const originalFetch = (globalThis as any).fetch;
(globalThis as any).fetch = async (input: any, init?: any): Promise<Response> => {
  const url = typeof input === "string" ? input : input.url;
  try {
    const parsed = new URL(
      url.startsWith("http") ? url : `http://localhost:8788${url.startsWith("/") ? url : `/${url}`}`,
    );
    const pathname = parsed.pathname;
    const host = parsed.host;

    if (pathname.startsWith("/api/products")) {
      const catalog = await loadLocalCatalog();
      return makeResponse(JSON.stringify(catalog), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (pathname.startsWith("/api/layout-drawings/")) {
      const id = pathname.split("/").pop() || "mock";
      const body = {
        id,
        fileName: `mock-layout-${id}.png`,
        fileUrl: `/api/objects/layout-${id}.png`,
        fileType: "image",
        thumbnailUrl: `/api/objects/layout-thumb-${id}.png`,
        projectName: "Warehouse 7 Traffic Layout",
        drawingTitle: "Proposed Barrier Placement - Zone A",
        drawingScale: "1:150",
        dwgNumber: "ASF-2026-007",
        revision: "Rev C",
        drawingDate: "2026-04-01",
      };
      return makeResponse(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Pure image routes — return PNG bytes with the right content-type so
    // loadImage() passes its "content-type starts with image/" guard.
    if (pathname.startsWith("/api/objects/") || host.includes("webcdn.asafe.com")) {
      const bytes = host.includes("webcdn.asafe.com")
        ? PNG_16X16_YELLOW_BYTES
        : PNG_1X1_BYTES;
      return makeResponse(bytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }

    // Fallback — any other URL gets a 1×1 PNG. Covers third-party imageUrls
    // that might be present in live catalog rows.
    return makeResponse(PNG_1X1_BYTES, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  } catch (err) {
    console.warn("[harness] fetch mock error for", url, err);
    return makeResponse("not found", { status: 404 });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// 3. Image decode shim — JSDOM's Image never fires onload. We patch it so
//    that setting .src triggers onload synchronously on a microtask tick.
//    The generator only needs img.width/img.height; real dimensions aren't
//    used beyond aspect-ratio math, so 1×1 is fine but we fake a plausible
//    size to make aspect-ratio-dependent scaling sensible.
// ─────────────────────────────────────────────────────────────────────────
const ImageCtor = (globalThis as any).Image;
if (ImageCtor) {
  const ImageProto = ImageCtor.prototype;
  const originalSrcDescriptor = Object.getOwnPropertyDescriptor(
    ImageProto,
    "src",
  );
  Object.defineProperty(ImageProto, "src", {
    configurable: true,
    set(this: any, value: string) {
      this._src = value;
      // Set sensible default dimensions so aspect-ratio math in the
      // generator produces reasonable layout.
      this.width = 160;
      this.height = 120;
      Promise.resolve().then(() => {
        try {
          this.onload?.({ target: this });
        } catch (err) {
          console.warn("[harness] Image onload threw:", err);
        }
      });
      if (originalSrcDescriptor?.set) {
        try {
          originalSrcDescriptor.set.call(this, value);
        } catch {
          // ignore jsdom rejecting a data URL
        }
      }
    },
    get(this: any) {
      return this._src;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Patch jspdf so pdf.save(name) writes to /tmp/${target} instead of
//    trying to download via a DOM link. We keep a module-level var that
//    the outer runner sets before each run.
// ─────────────────────────────────────────────────────────────────────────
let CURRENT_OUTPUT_PATH: string | null = null;

const jspdfModule = await import("jspdf");
// Under Node the "node" condition in jspdf's package.json maps to a CJS
// build whose module.exports has .jsPDF and .default. Under the browser
// condition (which Vite uses) we get ESM with the same shape. Normalise
// here and expose the same reference everywhere so monkey-patching
// API.save reaches the same prototype the generators are instantiating.
const jsPDFRaw: any =
  (jspdfModule as any).jsPDF ||
  (jspdfModule as any).default?.jsPDF ||
  (jspdfModule as any).default;
if (typeof jsPDFRaw !== "function") {
  console.error(
    "[harness] unexpected jspdf export shape:",
    Object.keys(jspdfModule),
    "default keys:",
    (jspdfModule as any).default && typeof (jspdfModule as any).default === "object"
      ? Object.keys((jspdfModule as any).default)
      : typeof (jspdfModule as any).default,
  );
  throw new Error("jspdf export is not a constructor");
}
const jsPDF: any = jsPDFRaw;

jsPDF.API.save = function (this: any, _filename?: string, _options?: any) {
  const arraybuffer = this.output("arraybuffer");
  const buf = Buffer.from(new Uint8Array(arraybuffer));
  const out = CURRENT_OUTPUT_PATH || `/tmp/test-pdf-${Date.now()}.pdf`;
  writeFileSync(out, buf);
  return this;
};

// ─────────────────────────────────────────────────────────────────────────
// 5. Load generators. Deferred import so every shim above is in place
//    before the generator module evaluates.
// ─────────────────────────────────────────────────────────────────────────
const orderFormModule = await import(
  "../client/src/utils/orderFormPdfGenerator.ts"
);
const siteSurveyModule = await import(
  "../client/src/utils/siteSurveyPdfGenerator.ts"
);

const { generateOrderFormPDF } = orderFormModule as typeof import("../client/src/utils/orderFormPdfGenerator.ts");
const { generateSiteSurveyPdf } = siteSurveyModule as typeof import("../client/src/utils/siteSurveyPdfGenerator.ts");

// ─────────────────────────────────────────────────────────────────────────
// 6. Rich mock data factories
// ─────────────────────────────────────────────────────────────────────────
const CUSTOMER = {
  customerName: "Ahmed Al-Mansouri",
  customerJobTitle: "Facilities Manager",
  customerCompany: "DNATA Cargo Operations LLC",
  customerMobile: "+971 50 123 4567",
  customerEmail: "ahmed.almansouri@dnata.ae",
  companyLogoUrl: "/api/objects/dnata-logo.png",
  drawingRef: "DWG-WH7-2026-R3",
};

const SALES_USER = {
  firstName: "Sarah",
  lastName: "Al-Rashid",
  jobTitle: "Senior Solutions Consultant",
  email: "sarah.alrashid@asafe.ae",
  phone: "+971 50 555 0142",
};

const UPLOADED_PHOTOS = [
  {
    url: "/api/objects/photo-dock-1.jpg",
    caption: "Loading dock #3 - impact damage visible",
    type: "area",
    areaId: "area-dock-01",
  },
  {
    url: "/api/objects/photo-aisle-2.jpg",
    caption: "Aisle 4 - pedestrian crossing point",
    type: "area",
    areaId: "area-dock-01",
  },
  {
    url: "/api/objects/photo-column-3.jpg",
    caption: "Structural column - north corridor",
    type: "area",
    areaId: "area-col-01",
  },
  {
    url: "/api/objects/photo-rack-4.jpg",
    caption: "Racking end at turning point",
    type: "area",
    areaId: "area-rack-01",
  },
];

function buildBaseOrder(
  itemsArr: any[],
  overrides: Partial<any> = {},
): any {
  const subtotal = itemsArr.reduce((s, i) => s + (i.totalPrice || 0), 0);
  return {
    orderNumber: overrides.orderNumber || "ORD-2026-04-A1",
    customOrderNumber: overrides.customOrderNumber,
    ...CUSTOMER,
    orderDate: "2026-04-18",
    items: itemsArr,
    servicePackage: overrides.servicePackage || "Professional Installation",
    discountOptions: [],
    discountDetails: overrides.discountDetails || [],
    reciprocalCommitments: overrides.reciprocalCommitments,
    totalAmount: subtotal,
    currency: "AED",
    impactCalculation: undefined,
    uploadedImages: overrides.uploadedImages || [],
    layoutDrawingId: overrides.layoutDrawingId,
    subtotal,
    discountAmount: overrides.discountAmount || 0,
    servicePackageCost: 3500,
    deliveryCharge: 1800,
    installationCharge: 4500,
    installationComplexity: "standard" as const,
    grandTotal: subtotal + 3500 + 1800 + 4500 - (overrides.discountAmount || 0),
    user: SALES_USER,
    isForUser: false,
    recommendedCaseStudies: [],
    recommendedResources: [],
    projectCaseStudies: [],
    includeBrandOverview: overrides.includeBrandOverview || false,
    technicalSignature: undefined,
    commercialSignature: undefined,
    marketingSignature: undefined,
    ...overrides,
  };
}

function item({
  name,
  qty,
  unit,
  linear = false,
  area,
  rating = 12000,
  description,
  variation,
  material,
  location,
  withImage = true,
}: {
  name: string;
  qty: number;
  unit: number;
  linear?: boolean;
  area: string;
  rating?: number;
  description?: string;
  variation?: string;
  material?: string;
  location?: string;
  withImage?: boolean;
}) {
  return {
    productName: name,
    quantity: qty,
    unitPrice: unit,
    totalPrice: qty * unit,
    impactRating: rating,
    pricingType: linear ? "linear_meter" : "single_item",
    imageUrl: withImage ? "/api/objects/product-" + encodeURIComponent(name.slice(0, 30)) + ".png" : undefined,
    applicationArea: area,
    description,
    variationDetails: variation,
    materialUsed: material,
    installationLocation: location,
  };
}

// Run A — minimal, 3 items, one zone
const ORDER_A_ITEMS = [
  item({
    name: "iFlex Single Traffic - 1600mm",
    qty: 4,
    unit: 2150,
    area: "Traffic & Wall Protection",
    rating: 14500,
    description: "Heavy-duty polymer single-rail traffic barrier.",
    variation: "1600mm length, standard height",
    material: "Memaplex polymer",
    location: "Main aisle, north corridor",
  }),
  item({
    name: "iFlex Single Traffic - 2000mm",
    qty: 6,
    unit: 2650,
    area: "Traffic & Wall Protection",
    rating: 14500,
  }),
  item({
    name: "Atlas Pedestrian Barrier - 1500mm",
    qty: 3,
    unit: 1750,
    area: "Traffic & Wall Protection",
    rating: 9500,
  }),
];

// Run B — spans all 6 zones, mix of linear and single
const ORDER_B_ITEMS = [
  // A: Door
  item({
    name: "Bollard Memaplex Single - 400mm",
    qty: 6,
    unit: 1200,
    area: "Door Protection",
    rating: 6200,
    description: "Memaplex single bollard for door-frame protection.",
    withImage: false, // test image-unavailable fallback
  }),
  // B: Column
  item({
    name: "FlexiShield Column Guard - 300mm x 300mm, Yellow",
    qty: 8,
    unit: 1650,
    area: "Column Protection",
    rating: 9000,
    variation: "Yellow, 300x300mm",
  }),
  // C: Racking
  item({
    name: "Rack End Barrier - Single Rail - 2000mm",
    qty: 12,
    unit: 1850,
    area: "Racking Protection",
    rating: 11000,
  }),
  // D: Traffic linear meter
  item({
    name: "iFlex Double Traffic - Linear Metre",
    qty: 24, // 24 metres
    unit: 1350,
    linear: true,
    area: "Traffic & Wall Protection",
    rating: 41000,
    description: "Tested against 10.6T vehicle at 10 km/h.",
  }),
  // E: Height restrictor
  item({
    name: "Height Restrictor Gantry - 3000mm Clearance",
    qty: 2,
    unit: 8500,
    area: "Height Restriction & Gates",
    rating: 12000,
  }),
  // F: Dock stop
  item({
    name: "Dock Buffer Stop - Forkguard DS",
    qty: 4,
    unit: 2100,
    area: "Dock, Stops & Accessories",
    rating: 14000,
  }),
];

// Run E — 4 surveyed areas with varying risk
const SURVEY_BASE = {
  id: "srv-2026-0421-xyz",
  title: "DNATA Cargo Warehouse 7 — Full Site Survey",
  facilityName: "DNATA Cargo Warehouse 7",
  facilityLocation: "Dubai Logistics City, UAE",
  description: "Post-expansion safety review across all MHE zones.",
  createdAt: "2026-04-02T09:00:00Z",
  updatedAt: "2026-04-14T11:00:00Z",
  requestedByName: "Ahmed Al-Mansouri",
  requestedByPosition: "Facilities Manager",
  requestedByEmail: "ahmed.almansouri@dnata.ae",
  requestedByMobile: "+971 50 123 4567",
  companyLogoUrl: "/api/objects/dnata-logo.png",
};

const SURVEY_E_AREAS = [
  {
    id: "area-dock-01",
    zoneName: "Inbound Receiving Zone",
    areaName: "Loading Dock #3",
    areaType: "Loading Docks",
    currentCondition: "damaged",
    riskLevel: "critical",
    issueDescription:
      "Multiple impact marks on dock edge; forklift nearly over-ran last month.",
    vehicleWeight: 4500,
    vehicleSpeed: 12,
    impactAngle: 30,
    calculatedJoules: 62500,
    photosUrls: [
      "/api/objects/photo-dock-1.jpg",
      "/api/objects/photo-dock-2.jpg",
    ],
    recommendedProducts: [
      {
        productId: "p-atlas-fork",
        productName: "Atlas Forkguard Barrier",
        imageUrl: "/api/objects/atlas-forkguard.png",
        impactRating: 32000,
        reason: "Dock-edge impact protection for 4.5T forklifts.",
        price: 4500,
      },
    ],
  },
  {
    id: "area-col-01",
    zoneName: "Main Aisle Zone",
    areaName: "North corridor structural columns",
    areaType: "Columns (Structural / Mezzanine)",
    currentCondition: "unprotected",
    riskLevel: "high",
    issueDescription:
      "Un-protected structural columns in high-frequency MHE traffic.",
    vehicleWeight: 2800,
    vehicleSpeed: 8,
    impactAngle: 45,
    calculatedJoules: 17800,
    photosUrls: ["/api/objects/photo-column-3.jpg"],
    recommendedProducts: [
      {
        productId: "p-flexi-col",
        productName: "FlexiShield Column Guard",
        imageUrl: "/api/objects/flexi-column.png",
        impactRating: 9000,
        reason: "Full-height column wrap, PAS 13 certified.",
        price: 1650,
      },
    ],
  },
  {
    id: "area-rack-01",
    zoneName: "Storage Zone C",
    areaName: "Racking end at turning point",
    areaType: "Racking",
    currentCondition: "damaged",
    riskLevel: "medium",
    issueDescription: "Rack leg partially deformed from prior impacts.",
    vehicleWeight: 2000,
    vehicleSpeed: 6,
    impactAngle: 20,
    calculatedJoules: 4000,
    photosUrls: ["/api/objects/photo-rack-4.jpg"],
    recommendedProducts: [
      {
        productId: "p-rack-end",
        productName: "Rack End Barrier",
        imageUrl: "/api/objects/rack-end.png",
        impactRating: 11000,
        reason: "Rack leg protector with integrated deflector.",
        price: 1850,
      },
    ],
  },
  {
    id: "area-ped-01",
    zoneName: "Pedestrian Zone",
    areaName: "Crew walkway across main aisle",
    areaType: "Pedestrian Walkways",
    currentCondition: "good",
    riskLevel: "low",
    issueDescription: "Paint-only markings with no physical segregation.",
    vehicleWeight: 1800,
    vehicleSpeed: 5,
    impactAngle: 10,
    calculatedJoules: 1200,
    photosUrls: ["/api/objects/photo-aisle-2.jpg"],
    recommendedProducts: [
      {
        productId: "p-iflex-ped",
        productName: "iFlex Pedestrian Barrier",
        imageUrl: "/api/objects/iflex-ped.png",
        impactRating: 9500,
        reason: "Pedestrian-to-vehicle segregation.",
        price: 1750,
      },
    ],
  },
];

// Run F — Same + extra recommendations so consolidation has something to group
const SURVEY_F_AREAS = SURVEY_E_AREAS.map((a) => ({
  ...a,
  recommendedProducts: [
    ...(a.recommendedProducts || []),
    {
      productId: "p-bollard-400",
      productName: "Bollard Memaplex Single",
      imageUrl: "/api/objects/bollard-400.png",
      impactRating: 6200,
      reason: "Spot-protection for critical fixtures.",
      price: 1200,
    },
    {
      productId: "p-alarm-bar",
      productName: "Alarm Bar",
      imageUrl: "/api/objects/alarm-bar.png",
      impactRating: 14000,
      reason: "Audible warning on approach.",
      price: 2900,
    },
  ],
}));

// ─────────────────────────────────────────────────────────────────────────
// 7. Run the scenarios. Each run swaps CURRENT_OUTPUT_PATH, invokes the
//    generator, reads back the PDF to report page count & file size, then
//    continues regardless of failure.
// ─────────────────────────────────────────────────────────────────────────
interface RunReport {
  label: string;
  output: string;
  ok: boolean;
  pageCount: number | null;
  sizeKb: number | null;
  error?: string;
  warnings: string[];
}

// Capture console.warn calls during each run so we can surface them.
const warningsBuffer: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  warningsBuffer.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 0))).join(" "));
  originalWarn(...args);
};

async function runOrder(
  label: string,
  orderData: any,
  outPath: string,
): Promise<RunReport> {
  warningsBuffer.length = 0;
  CURRENT_OUTPUT_PATH = outPath;
  let pageCount: number | null = null;
  let capturedPdf: any = null;

  // Shim to capture the jsPDF instance so we can read its page count after
  // generation completes. Wrap API.save once more per-run.
  const previousSave = jsPDF.API.save;
  jsPDF.API.save = function (this: any, _filename?: string, _options?: any) {
    capturedPdf = this;
    pageCount = this.getNumberOfPages ? this.getNumberOfPages() : null;
    return previousSave.call(this, _filename, _options);
  };

  try {
    await generateOrderFormPDF(orderData, (v: number) =>
      `AED ${Math.round(v).toLocaleString("en-US")}`,
    );
    const size = statSync(outPath).size;
    return {
      label,
      output: outPath,
      ok: true,
      pageCount,
      sizeKb: +(size / 1024).toFixed(1),
      warnings: [...warningsBuffer],
    };
  } catch (err: any) {
    console.error(`\n[RUN ${label}] FAILED:`, err);
    return {
      label,
      output: outPath,
      ok: false,
      pageCount,
      sizeKb: existsSync(outPath) ? +(statSync(outPath).size / 1024).toFixed(1) : null,
      error: err?.stack || err?.message || String(err),
      warnings: [...warningsBuffer],
    };
  } finally {
    jsPDF.API.save = previousSave;
  }
}

async function runSurvey(
  label: string,
  survey: any,
  areas: any[],
  outPath: string,
): Promise<RunReport> {
  warningsBuffer.length = 0;
  CURRENT_OUTPUT_PATH = outPath;
  let pageCount: number | null = null;

  const previousSave = jsPDF.API.save;
  jsPDF.API.save = function (this: any, _filename?: string, _options?: any) {
    pageCount = this.getNumberOfPages ? this.getNumberOfPages() : null;
    return previousSave.call(this, _filename, _options);
  };

  try {
    await generateSiteSurveyPdf(survey, areas, {
      id: "user-harness",
      email: SALES_USER.email,
      firstName: SALES_USER.firstName,
      lastName: SALES_USER.lastName,
      jobTitle: SALES_USER.jobTitle,
      company: "A-SAFE DWC-LLC",
      phone: SALES_USER.phone,
    });
    const size = statSync(outPath).size;
    return {
      label,
      output: outPath,
      ok: true,
      pageCount,
      sizeKb: +(size / 1024).toFixed(1),
      warnings: [...warningsBuffer],
    };
  } catch (err: any) {
    console.error(`\n[RUN ${label}] FAILED:`, err);
    return {
      label,
      output: outPath,
      ok: false,
      pageCount,
      sizeKb: existsSync(outPath) ? +(statSync(outPath).size / 1024).toFixed(1) : null,
      error: err?.stack || err?.message || String(err),
      warnings: [...warningsBuffer],
    };
  } finally {
    jsPDF.API.save = previousSave;
  }
}

const reports: RunReport[] = [];

console.log("── A-SAFE PDF Generator Harness ──────────────────────────────");

// Run A
reports.push(
  await runOrder(
    "A",
    buildBaseOrder(ORDER_A_ITEMS, { orderNumber: "ORD-A-MIN" }),
    "/tmp/test-order-A.pdf",
  ),
);

// Run B
reports.push(
  await runOrder(
    "B",
    buildBaseOrder(ORDER_B_ITEMS, { orderNumber: "ORD-B-SIX" }),
    "/tmp/test-order-B.pdf",
  ),
);

// Run C — B + brand overview
reports.push(
  await runOrder(
    "C",
    buildBaseOrder(ORDER_B_ITEMS, {
      orderNumber: "ORD-C-BRAND",
      includeBrandOverview: true,
    }),
    "/tmp/test-order-C.pdf",
  ),
);

// Run D — C + photos + layout drawing
reports.push(
  await runOrder(
    "D",
    buildBaseOrder(ORDER_B_ITEMS, {
      orderNumber: "ORD-D-FULL",
      includeBrandOverview: true,
      uploadedImages: UPLOADED_PHOTOS,
      layoutDrawingId: "mock-layout-xyz",
    }),
    "/tmp/test-order-D.pdf",
  ),
);

// Run E — survey 4 areas
reports.push(
  await runSurvey("E", SURVEY_BASE, SURVEY_E_AREAS, "/tmp/test-survey-E.pdf"),
);

// Run F — survey 4 areas + extra recommendations
reports.push(
  await runSurvey(
    "F",
    { ...SURVEY_BASE, id: "srv-2026-0421-fff" },
    SURVEY_F_AREAS,
    "/tmp/test-survey-F.pdf",
  ),
);

// ─────────────────────────────────────────────────────────────────────────
// 8. Report
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── Results ───────────────────────────────────────────────────");
const lines: string[] = [];
lines.push("A-SAFE PDF Generator Harness — results");
lines.push(`Run at: ${new Date().toISOString()}`);
lines.push("");
lines.push(
  ["Run", "Status", "Pages", "Size (KB)", "Output", "Warnings", "Notes"].join(" | "),
);
lines.push(
  ["---", "---", "---", "---", "---", "---", "---"].join(" | "),
);
for (const r of reports) {
  const status = r.ok ? "OK" : "FAILED";
  const note = r.error ? r.error.split("\n")[0].slice(0, 180) : "";
  lines.push(
    [
      r.label,
      status,
      r.pageCount ?? "?",
      r.sizeKb ?? "?",
      r.output,
      r.warnings.length,
      note,
    ].join(" | "),
  );
  console.log(
    `  ${r.label}  ${status.padEnd(6)}  pages=${r.pageCount ?? "?"}  ${String(r.sizeKb ?? "?").padStart(5)}KB  ${r.output}`,
  );
  if (r.warnings.length) {
    console.log(`        ${r.warnings.length} warnings (${r.warnings[0].slice(0, 120)})`);
  }
  if (r.error) {
    console.log(`        ERROR: ${note}`);
  }
}

const passed = reports.filter((r) => r.ok).length;
const failed = reports.length - passed;
lines.push("");
lines.push(`Summary: ${passed}/${reports.length} passed, ${failed} failed.`);

// Include the first 2000 chars of the first failed run's stack to help debug.
const failedWithStack = reports.find((r) => !r.ok && r.error);
if (failedWithStack) {
  lines.push("");
  lines.push("First failure stack:");
  lines.push(failedWithStack.error!.slice(0, 2000));
}

await writeFile("/tmp/pdf-test-report.txt", lines.join("\n"), "utf8");
console.log("\nReport written to /tmp/pdf-test-report.txt");
console.log(`${passed}/${reports.length} runs passed.`);
process.exit(failed === 0 ? 0 : 1);
