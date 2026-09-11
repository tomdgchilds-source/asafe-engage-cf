/**
 * Smoke test for the client-side, image-capable order-form PDF generator.
 *
 * Runs under vitest's plain `node` environment (no jsdom/happy-dom in this
 * repo), so the handful of browser globals the generator touches are
 * stubbed here: window.location, Image, FileReader, fetch. jsPDF itself
 * resolves to its node build and renders for real. `react-pdf` is mocked
 * because the fixture never rasterises a PDF drawing and pdfjs-dist needs
 * a full DOM to even import.
 *
 * What this proves:
 *   - the generator completes end-to-end with images, notes and a
 *     per-metre line, and emits a PDF of a plausible size;
 *   - a hanging image URL does NOT block generation (8 s timeout path);
 *   - the Installation notes / impact / qty text lands in the document.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: "" }, getDocument: () => { throw new Error("not used"); } },
}));

// 1×1 transparent PNG.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const HANG_URL = "https://dead-cdn.example.com/never-responds.png";
let hangingFetches = 0;

function pngResponse(): Response {
  return new Response(new Uint8Array(PNG_1X1), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

beforeAll(() => {
  // jsPDF binds window.atob/btoa at import time; the generator reads
  // window.location.origin for same-origin credential decisions.
  const fakeWindow: Record<string, unknown> = {
    location: { origin: "http://localhost:8788", search: "" },
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    document: { createElement: () => ({ getContext: () => null }) },
  };
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("location", fakeWindow.location);
  vi.stubGlobal("document", fakeWindow.document);

  // Image: fire onload on the next microtask with plausible dimensions.
  class FakeImage {
    width = 160;
    height = 120;
    onload: null | ((e?: unknown) => void) = null;
    onerror: null | ((e?: unknown) => void) = null;
    set src(_v: string) {
      Promise.resolve().then(() => this.onload?.({ target: this }));
    }
  }
  vi.stubGlobal("Image", FakeImage);

  // FileReader: only readAsDataURL is used.
  class FakeFileReader {
    result: string | null = null;
    onloadend: null | (() => void) = null;
    onerror: null | (() => void) = null;
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = `data:${blob.type || "image/png"};base64,${Buffer.from(buf).toString("base64")}`;
        this.onloadend?.();
      });
    }
  }
  vi.stubGlobal("FileReader", FakeFileReader);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(HANG_URL)) {
        hangingFetches++;
        // Never resolve unless aborted — simulates a dead CDN.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
      }
      if (url.includes("/api/products")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return pngResponse();
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function fixtureOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: "ORD-TEST-001",
    customerName: "Aisha Rahman",
    customerJobTitle: "Operations Manager",
    customerCompany: "Dnata Cargo",
    customerMobile: "+971 50 000 0000",
    customerEmail: "aisha@example.com",
    companyLogoUrl: "/api/objects/customer-logo.png",
    orderDate: "2026-09-11T08:00:00.000Z",
    items: [
      {
        productName: "iFlex Double Traffic Barrier",
        quantity: 12.4,
        unitPrice: 900,
        totalPrice: 11160,
        impactRating: 19200,
        pricingType: "linear_meter",
        imageUrl: "https://webcdn.asafe.com/iflex-double.png",
        applicationArea: "Traffic aisle",
      },
      {
        productName: "Bollard Memaplex Single - 1000mm",
        quantity: 4,
        unitPrice: 650,
        totalPrice: 2600,
        impactRating: 6200,
        pricingType: "per_item",
        imageUrl: "https://webcdn.asafe.com/bollard.png",
        applicationArea: "Door",
      },
    ],
    // Two dead-CDN photos in the same preload phase: they time out in
    // parallel, so the whole run pays the 8 s budget once, not twice.
    uploadedImages: [
      { url: "/api/objects/site-photo-1.jpg", caption: "Aisle 4 looking north" },
      { url: HANG_URL, caption: "Dead CDN photo" },
      { url: `${HANG_URL}?2`, caption: "Another dead CDN photo" },
    ],
    installationNotes:
      "Floor is power-floated concrete, 200 mm slab. Chemical anchors preferred. Dock buffers and weld plates to be quoted separately.",
    currency: "AED",
    totalAmount: 13760,
    subtotal: 13760,
    discountAmount: 0,
    servicePackageCost: 0,
    deliveryCharge: 0,
    installationCharge: 0,
    installationComplexity: "standard",
    grandTotal: 13760,
    user: { firstName: "Tom", lastName: "Childs", email: "tom@asafe.ae" },
    ...overrides,
  };
}

describe("generateOrderFormPDF (client-side, image-capable)", () => {
  it("renders a multi-page PDF with images, notes and per-metre lines, and survives a dead image URL", async () => {
    const { default: jsPDF } = await import("jspdf");
    const { generateOrderFormPDF } = await import("./orderFormPdfGenerator");

    let bytes: ArrayBuffer | null = null;
    let pageCount = 0;
    let text = "";
    const originalSave = jsPDF.API.save;
    jsPDF.API.save = function (this: any) {
      bytes = this.output("arraybuffer");
      pageCount = this.getNumberOfPages();
      // Uncompressed text streams keep the literal strings visible, so we
      // can assert on content without a PDF parser.
      text = Buffer.from(bytes as ArrayBuffer).toString("latin1");
      return this;
    } as any;

    const started = Date.now();
    try {
      await generateOrderFormPDF(fixtureOrder() as any, (v) => `AED ${v}`);
    } finally {
      jsPDF.API.save = originalSave;
    }
    const elapsed = Date.now() - started;

    expect(bytes).not.toBeNull();
    expect((bytes as unknown as ArrayBuffer).byteLength).toBeGreaterThan(10 * 1024);
    expect(pageCount).toBeGreaterThanOrEqual(3);

    // Dead-CDN images were attempted and the generator still finished
    // well within the 8 s per-image budget (the two hanging loads race
    // in parallel with the rest of the preload).
    expect(hangingFetches).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(20_000);

    // Content assertions on the raw stream.
    expect(text).toContain("INSTALLATION NOTES");
    expect(text).toContain("19,200 J");
    expect(text).toContain("12.4 m");
    expect(text).toContain("IMPACT");
  }, 30_000);

  it("omits the Installation notes section when the notes are empty", async () => {
    const { default: jsPDF } = await import("jspdf");
    const { generateOrderFormPDF } = await import("./orderFormPdfGenerator");

    let text = "";
    const originalSave = jsPDF.API.save;
    jsPDF.API.save = function (this: any) {
      text = Buffer.from(this.output("arraybuffer")).toString("latin1");
      return this;
    } as any;
    try {
      await generateOrderFormPDF(
        fixtureOrder({ installationNotes: "   ", uploadedImages: [] }) as any,
        (v) => `AED ${v}`,
      );
    } finally {
      jsPDF.API.save = originalSave;
    }
    expect(text).not.toContain("INSTALLATION NOTES");
  }, 30_000);
});
