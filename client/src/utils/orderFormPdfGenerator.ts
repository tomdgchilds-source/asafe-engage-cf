import jsPDF from "jspdf";
import { pdfjs } from "react-pdf";
import asafeLogoImg from "../../../attached_assets/A-SAFE_Logo_Strapline_Secondary_Version_1767686263231.png";

// Reuse the pdfjs instance react-pdf already loads for the layout-markup
// viewer. Importing from "react-pdf" gives us the exact build its worker is
// pinned to, so we never end up with two different pdfjs versions trying to
// share one worker. The worker itself is registered globally in
// components/layout-markup/constants.ts (pdfjs.GlobalWorkerOptions.workerSrc);
// that side-effectful module runs once the layout-markup tree mounts, which
// happens on any order-form route well before the user can trigger the PDF.
// For the rare case someone generates a PDF without having touched that tree
// first, we fall back to the same /pdf.worker.min.mjs path.
if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

// ═══════════════════════════════════════════════════════════════════════
// A-SAFE ENGAGE — Order Form PDF Generator (v3)
//
// Rewritten to match siteSurveyPdfGenerator's consulting-grade aesthetic:
//   - shared typography / spacing tokens (so both docs feel like one family)
//   - yellow as accent only (thin vertical bars for section headings)
//   - real product imagery + PAS 13 data block per solution card
//   - customer logo + project ref on cover
//   - site reference photo gallery
//   - embedded layout drawing snapshot (raster files render directly; PDF
//     drawings are rasterised client-side via pdf.js before jsPDF is written)
//   - retained approval flow structure (Technical / Commercial / Marketing)
//     with non-clickable "Approve live in the app" pills. Sections already
//     signed server-side (/sign or /approve-section) stamp "Approved by ..."
//     instead, plus a "Next step" hint pointing at the following approver.
//
// PUBLIC CONTRACT IS UNCHANGED:
//   generateOrderFormPDF(orderData: OrderFormPdfData, formatPrice)
// OrderForm.tsx continues to work without any modification.
// ═══════════════════════════════════════════════════════════════════════

// Signature shape supports both the legacy `/sign` endpoint (signature /
// signerJobTitle / signerMobile) and the newer `/approve-section` endpoint
// (signedBy / jobTitle). `signed` is the gate that toggles the APPROVE
// button vs the "Approved by …" stamp.
interface SignatureField {
  name?: string;
  signedBy?: string;
  signature?: string;
  jobTitle?: string;
  signerJobTitle?: string;
  mobile?: string;
  signerMobile?: string;
  signedAt?: string;
  date?: string;
  signed?: boolean;
}

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  impactRating?: number;
  pricingType?: string;
  imageUrl?: string;
  category?: string;
  applicationArea?: string;
  productId?: string;
  pas13Video?: string;
  installationVideo?: string;
  impactTestVideo?: string;
  technicalGuideUrl?: string;
  installationGuideUrl?: string;
  certificateUrl?: string;
  caseStudies?: Array<{ id: string; title: string; pdfUrl?: string }>;
  referenceImages?: Array<{ url: string; caption?: string }>;
  installationLocation?: string;
  notes?: string;
  variationDetails?: string;
  materialUsed?: string;
  specifications?: any;
  description?: string;
  layoutDrawingId?: string;
}

interface DiscountDetail {
  id: string;
  optionId?: string;
  title: string;
  description?: string;
  category?: string;
  discountPercent: number;
}

interface UploadedImage {
  url: string;
  caption?: string;
  areaId?: string;
  productId?: string;
  type?: string; // "area" | "product" | ...
}

interface OrderFormPdfData {
  orderNumber: string;
  customOrderNumber?: string;
  customerName?: string;
  customerJobTitle?: string;
  customerCompany?: string;
  customerMobile?: string;
  customerEmail?: string;
  /** Customer logo (same-origin /api/objects/... URL, needs auth cookie) */
  companyLogoUrl?: string;
  orderDate: string;
  items: OrderItem[];
  servicePackage?: string;
  discountOptions?: string[];
  discountDetails?: DiscountDetail[];
  reciprocalCommitments?: any;
  totalAmount: number;
  currency: string;
  technicalSignature?: SignatureField;
  commercialSignature?: SignatureField;
  marketingSignature?: SignatureField;
  impactCalculation?: any;
  layoutDrawings?: any[];
  layoutDrawingId?: string;
  layoutMarkups?: any[];
  uploadedImages?: UploadedImage[];
  subtotal: number;
  discountAmount: number;
  reciprocalDiscountAmount?: number;
  partnerDiscountPercent?: number;
  partnerDiscountAmount?: number;
  partnerDiscountCode?: string;
  servicePackageCost: number;
  deliveryCharge: number;
  installationCharge: number;
  installationComplexity?: "simple" | "standard" | "complex";
  grandTotal: number;
  user?: any;
  isForUser?: boolean;
  recommendedCaseStudies?: any[];
  recommendedResources?: any[];
  projectCaseStudies?: any[];
  linkedInDiscountAmount?: number;
  linkedInDiscountData?: any;
  /** The email of whoever owns the NEXT approval step, keyed by the
   *  section they need to approve. Populated server-side based on the
   *  order's configured approval chain. When present, the PDF renders a
   *  small "Next step: Commercial → bob@dnata.ae" hint under the signed
   *  stamp so the paper trail matches what the app shows live. */
  nextApproverEmails?: {
    technical?: string;
    commercial?: string;
    marketing?: string;
  };
}

// ───────────────────────────────────────────────────────────────────────
// Image loading
//
// Mirrors the helper in siteSurveyPdfGenerator so both generators behave
// identically. Critical: /api/objects/* URLs on our own domain are cookie-
// gated. We must pass credentials: "include" or user-uploaded imagery
// silently returns 401 and never renders.
// ───────────────────────────────────────────────────────────────────────
async function loadImage(
  src: string,
): Promise<{ dataUrl: string; width: number; height: number }> {
  let fetchUrl = src;
  if (src.startsWith("/")) {
    fetchUrl = window.location.origin + src;
  }
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

// Swallow errors — some images are expected to be missing (bad URLs in old
// data) and we don't want a single bad photo to abort PDF generation.
async function tryLoadImage(src: string | undefined | null) {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch (err) {
    console.warn(`[orderFormPdf] image failed: ${src}`, err);
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
// PDF → raster (page 1)
//
// jsPDF has no way to embed another PDF inline, so when a customer's
// layout drawing is a PDF we rasterise its first page through pdf.js and
// embed the resulting JPEG. We reuse the same pdfjs module as react-pdf
// (see the import at the top of this file) so there's exactly one
// pdfjs-dist on the page; a second copy would fight the first for the
// shared worker.
//
// Memory note: a 2000px-wide canvas holds ~2000 × 1400 × 4 ≈ 11MB of
// RGBA data, plus an equivalent allocation inside the worker while it
// paints. Big CAD pages briefly touch 30–50MB during render. We drop
// every reference to the canvas and viewport immediately after reading
// the dataURL so the GC can reclaim it before we hand control back to
// the main generator loop.
// ───────────────────────────────────────────────────────────────────────
async function rasterisePdfFirstPage(
  url: string,
  targetWidthPx: number = 2000,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    // Hard cap matches the old CAD-export horror stories: anything above
    // 4k wide produces a dataURL >15MB that jsPDF then re-encodes into
    // the output PDF, ballooning file size with no visible quality gain.
    const clampedWidth = Math.min(Math.max(targetWidthPx, 300), 4000);

    let fetchUrl = url;
    if (url.startsWith("/")) {
      fetchUrl = window.location.origin + url;
    }
    const sameOrigin = fetchUrl.startsWith(window.location.origin);
    const response = await fetch(
      fetchUrl,
      sameOrigin ? { credentials: "include" } : {},
    );
    if (!response.ok) {
      throw new Error(`PDF HTTP ${response.status}: ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    // Copy into a fresh Uint8Array — the pdfjs worker transfers typed
    // arrays and would detach our backing buffer, which matters if the
    // caller retries.
    const bytes = new Uint8Array(arrayBuffer.byteLength);
    bytes.set(new Uint8Array(arrayBuffer));

    const loadingTask = pdfjs.getDocument({ data: bytes });
    const doc = await loadingTask.promise;
    try {
      const page = await doc.getPage(1);
      // Default viewport is in CSS pixels (1 unit = 1/72"). Scale to hit
      // the requested pixel width without exceeding clampedWidth.
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = clampedWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");

      // pdfjs-dist 5.x expects both the 2D context and the canvas itself
      // — omitting `canvas` triggers a deprecation warning and, in some
      // versions, a hard failure when canvas transfer is required.
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      const width = canvas.width;
      const height = canvas.height;

      // Release GPU/heap memory held by the canvas before returning.
      // Shrinking to 0×0 is the documented trick for forcing mobile
      // Safari to drop the backing store immediately rather than waiting
      // for GC.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      return { dataUrl, width, height };
    } finally {
      // Always destroy the pdfjs document to free its worker-side
      // resources even if rendering threw.
      await doc.destroy();
    }
  } catch (err) {
    console.warn(`[orderFormPdf] pdf rasterise failed: ${url}`, err);
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Product catalog fetch
//
// Hits /api/products?grouped=false&pageSize=200 once so we can cross-
// reference each order item by name and pull the richer data (description,
// PAS 13 compliance, height range, real imageUrl) that the order-items
// snapshot doesn't carry. Failures are soft: the PDF still renders, we
// just fall back to whatever the item already had.
// ───────────────────────────────────────────────────────────────────────
interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  impactRating?: number | null;
  pas13Compliant?: boolean | null;
  pas13TestMethod?: string | null;
  pas13TestJoules?: number | null;
  heightMin?: number | null;
  heightMax?: number | null;
  specifications?: any;
  productMedia?: Array<{ url?: string; mediaUrl?: string; mediaType?: string }>;
}

async function fetchCatalog(): Promise<CatalogProduct[]> {
  try {
    const res = await fetch("/api/products?grouped=false&pageSize=200", {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = await res.json();
    // The endpoint returns either an array or a paginated envelope.
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.products)) return data.products;
    return [];
  } catch (err) {
    console.warn("[orderFormPdf] catalog fetch failed", err);
    return [];
  }
}

// Catalog entries have had names slightly normalised during import (e.g. the
// same barrier appears as "iFlex Single Traffic Barrier - 1000mm - Standard"
// in the order items but just "iFlex Single Traffic Barrier" in the catalog
// family). Stepped match: exact, then prefix, then substring, then a token-
// overlap tiebreaker for stubborn cases.
function matchCatalogEntry(itemName: string, catalog: CatalogProduct[]): CatalogProduct | null {
  if (!catalog.length) return null;
  const norm = (s: string) =>
    s.toLowerCase().replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
  const target = norm(itemName);

  const exact = catalog.find((p) => norm(p.name) === target);
  if (exact) return exact;
  const prefix = catalog.find((p) => target.startsWith(norm(p.name)));
  if (prefix) return prefix;
  const contains = catalog.find((p) => target.includes(norm(p.name)));
  if (contains) return contains;

  const tokens = target.split(/[\s,\-]+/).filter(Boolean);
  let best: CatalogProduct | null = null;
  let bestLen = 0;
  for (const p of catalog) {
    const pn = norm(p.name);
    const pTokens = pn.split(/[\s,\-]+/).filter(Boolean);
    const overlap = pTokens.filter((t) => tokens.includes(t)).length;
    if (overlap >= Math.max(2, Math.floor(pTokens.length * 0.7)) && pn.length > bestLen) {
      best = p;
      bestLen = pn.length;
    }
  }
  return best;
}

function pickProductImageUrl(item: OrderItem, cat: CatalogProduct | null): string | null {
  if (item.imageUrl) return item.imageUrl;
  if (cat?.imageUrl) return cat.imageUrl;
  const media = cat?.productMedia?.[0];
  if (media?.mediaUrl) return media.mediaUrl;
  if (media?.url) return media.url;
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Layout drawing fetch
// ───────────────────────────────────────────────────────────────────────
interface LayoutDrawing {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string; // "image" | "pdf"
  thumbnailUrl?: string;
  projectName?: string;
  drawingTitle?: string;
  drawingScale?: string;
  dwgNumber?: string;
  revision?: string;
  drawingDate?: string;
}

async function fetchLayoutDrawing(id: string): Promise<LayoutDrawing | null> {
  try {
    const res = await fetch(`/api/layout-drawings/${id}`, { credentials: "include" });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[orderFormPdf] layout drawing fetch failed: ${id}`, err);
    return null;
  }
}

// Resolve a signature to display strings regardless of which backend endpoint
// populated it (legacy `/sign` vs newer `/approve-section`).
function resolveSignatureName(sig: SignatureField | undefined): string {
  if (!sig) return "";
  return sig.signedBy || sig.signature || sig.name || "";
}

function resolveSignatureDate(sig: SignatureField | undefined): string {
  if (!sig) return "";
  if (sig.date) return sig.date;
  if (sig.signedAt) {
    return new Date(sig.signedAt).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return "";
}

function resolveSignatureJobTitle(sig: SignatureField | undefined): string {
  if (!sig) return "";
  return sig.jobTitle || sig.signerJobTitle || "";
}

function resolveSignatureMobile(sig: SignatureField | undefined): string {
  if (!sig) return "";
  return sig.mobile || sig.signerMobile || "";
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════════════

export async function generateOrderFormPDF(
  orderData: OrderFormPdfData,
  // formatPrice retained for backwards compatibility but unused — the PDF
  // formats currency explicitly so summary rows stay consistent regardless
  // of the locale context the caller is running in.
  _formatPrice: (value: number) => string,
): Promise<void> {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth(); // 210
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297
  const margin = 18;
  const contentWidth = pageWidth - margin * 2; // 174
  let yPosition = 0;
  let currentPageNum = 1;

  // ───── Design tokens — MIRROR siteSurveyPdfGenerator ────────────────
  const ink = {
    black: [17, 24, 39] as [number, number, number],
    heading: [15, 23, 42] as [number, number, number],
    body: [55, 65, 81] as [number, number, number],
    muted: [107, 114, 128] as [number, number, number],
    subtle: [156, 163, 175] as [number, number, number],
    line: [229, 231, 235] as [number, number, number],
    softLine: [243, 244, 246] as [number, number, number],
    surface: [249, 250, 251] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };
  const brand = {
    yellow: [255, 199, 44] as [number, number, number],
    yellowDark: [202, 138, 4] as [number, number, number],
    yellowSoft: [254, 243, 199] as [number, number, number],
  };
  const accent = {
    green: [22, 163, 74] as [number, number, number],
    greenDark: [34, 139, 34] as [number, number, number],
    red: [220, 38, 38] as [number, number, number],
    blue: [37, 99, 235] as [number, number, number],
  };

  const setFill = (c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c: [number, number, number]) => pdf.setDrawColor(c[0], c[1], c[2]);
  const setText = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
  const setFont = (size: number, weight: "normal" | "bold" | "italic" = "normal") => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", weight);
  };

  const hr = (
    y: number,
    color: [number, number, number] = ink.line,
    width = 0.3,
  ) => {
    setStroke(color);
    pdf.setLineWidth(width);
    pdf.line(margin, y, pageWidth - margin, y);
  };

  const wrap = (text: string, maxW: number): string[] => pdf.splitTextToSize(text, maxW) as string[];

  // ───── Division / contact-block resolution ──────────────────────────
  const getCompanyName = () => {
    if (orderData.currency === "SAR") return "A-SAFE FOR SAFETY COMPANY";
    if (orderData.currency === "AED") return "A-SAFE DWC-LLC";
    return "A-SAFE MIDDLE EAST";
  };
  const divisionName = getCompanyName();
  const returnEmail = orderData.currency === "SAR" ? "sales@asafe.sa" : "sales@asafe.ae";
  const officePhone = orderData.currency === "SAR" ? "+966 13 857 3111" : "+971 4 884 2422";

  // Prefer the sales-friendly custom order number if it's been set.
  const orderRef = orderData.customOrderNumber?.trim() || orderData.orderNumber;
  const orderDateFormatted = new Date(orderData.orderDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const money = (v: number) => `${orderData.currency} ${Math.round(v).toLocaleString("en-US")}`;

  // ───── Preload assets in parallel so generation stays fast ──────────
  const [asafeLogo, customerLogo, catalog, fetchedLayout] = await Promise.all([
    tryLoadImage(asafeLogoImg),
    orderData.companyLogoUrl ? tryLoadImage(orderData.companyLogoUrl) : Promise.resolve(null),
    fetchCatalog(),
    orderData.layoutDrawingId ? fetchLayoutDrawing(orderData.layoutDrawingId) : Promise.resolve(null),
  ]);

  // Cross-reference each item against the catalog + preload product images
  interface ResolvedItem {
    item: OrderItem;
    cat: CatalogProduct | null;
    img: { dataUrl: string; width: number; height: number } | null;
  }
  const resolvedItems: ResolvedItem[] = await Promise.all(
    orderData.items.map(async (item) => {
      const cat = matchCatalogEntry(item.productName, catalog);
      const imageUrl = pickProductImageUrl(item, cat);
      const img = await tryLoadImage(imageUrl);
      return { item, cat, img };
    }),
  );

  // Preload uploaded site-reference photos — preserve order so captions stay
  // aligned with their source entries.
  interface LoadedPhoto {
    src: UploadedImage;
    img: { dataUrl: string; width: number; height: number } | null;
  }
  const uploaded = orderData.uploadedImages || [];
  const loadedPhotos: LoadedPhoto[] = await Promise.all(
    uploaded.map(async (u) => ({ src: u, img: await tryLoadImage(u.url) })),
  );
  const renderablePhotos = loadedPhotos.filter((p) => p.img) as Array<{
    src: UploadedImage;
    img: { dataUrl: string; width: number; height: number };
  }>;

  // Preload the layout drawing. Raster files (PNG/JPG/WEBP) go straight
  // through loadImage. PDF drawings get rasterised here, BEFORE jsPDF is
  // written to, so the generator loop below doesn't have to care which
  // format the source was — it just sees a dataURL + dimensions. If
  // rasterisation fails we fall back to the pre-rendered thumbnail, and
  // then to the attachment-reference placeholder further down.
  let layoutDrawingImg: { dataUrl: string; width: number; height: number } | null = null;
  if (fetchedLayout && fetchedLayout.fileType !== "pdf") {
    layoutDrawingImg = await tryLoadImage(fetchedLayout.fileUrl);
    if (!layoutDrawingImg && fetchedLayout.thumbnailUrl) {
      layoutDrawingImg = await tryLoadImage(fetchedLayout.thumbnailUrl);
    }
  } else if (fetchedLayout && fetchedLayout.fileType === "pdf") {
    layoutDrawingImg = await rasterisePdfFirstPage(fetchedLayout.fileUrl, 2000);
    if (!layoutDrawingImg && fetchedLayout.thumbnailUrl) {
      // Server-side thumbnails are typically lower-resolution but still
      // embed cleanly — better than a placeholder when the PDF itself
      // won't parse (encrypted, corrupt, password-protected, etc.).
      layoutDrawingImg = await tryLoadImage(fetchedLayout.thumbnailUrl);
    }
  }

  // ───── Page chrome ──────────────────────────────────────────────────
  const pageHeader = () => {
    setFill(brand.yellow);
    pdf.rect(0, 0, pageWidth, 2, "F");

    if (asafeLogo) {
      const maxW = 28,
        maxH = 10;
      const r = asafeLogo.width / asafeLogo.height;
      const w = r > maxW / maxH ? maxW : maxH * r;
      const h = r > maxW / maxH ? maxW / r : maxH;
      pdf.addImage(asafeLogo.dataUrl, "PNG", margin, 7, w, h);
    }

    setFont(7, "normal");
    setText(ink.muted);
    pdf.text("ORDER FORM", pageWidth - margin, 10, { align: "right" });
    setFont(7, "bold");
    setText(ink.black);
    const client = orderData.customerCompany || "CLIENT";
    pdf.text(`${client.toUpperCase()} | ${orderRef}`, pageWidth - margin, 14, { align: "right" });

    hr(20);
    yPosition = 28;
  };

  const pageFooter = () => {
    const y = pageHeight - 12;
    hr(y - 6);

    setFont(7, "normal");
    setText(ink.muted);
    pdf.text(`${divisionName} | ${officePhone} | ${returnEmail}`, margin, y - 2);

    setFont(7, "bold");
    setText(brand.yellowDark);
    pdf.text("www.asafe.com", pageWidth / 2, y - 2, { align: "center" });

    setFont(7, "normal");
    setText(ink.muted);
    pdf.text(`CONFIDENTIAL | Page ${currentPageNum}`, pageWidth - margin, y - 2, { align: "right" });
  };

  const footerSafeBottom = pageHeight - 22;

  const newPage = () => {
    pageFooter();
    pdf.addPage();
    currentPageNum++;
    yPosition = 0;
    pageHeader();
  };

  const needSpace = (required: number) => {
    if (yPosition + required > footerSafeBottom) newPage();
  };

  // Section heading — thin yellow vertical bar + caps title (survey parity)
  const sectionHeading = (text: string, subtitle?: string) => {
    needSpace(subtitle ? 20 : 15);
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

  const eyebrow = (text: string, x: number, y: number) => {
    setFont(7, "bold");
    setText(ink.muted);
    pdf.text(text.toUpperCase(), x, y, { charSpace: 0.5 });
  };

  // ═══════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ═══════════════════════════════════════════════════════════════════
  setFill(brand.yellow);
  pdf.rect(0, 0, pageWidth, 3, "F");

  if (asafeLogo) {
    const maxW = 46,
      maxH = 16;
    const r = asafeLogo.width / asafeLogo.height;
    const w = r > maxW / maxH ? maxW : maxH * r;
    const h = r > maxW / maxH ? maxW / r : maxH;
    pdf.addImage(asafeLogo.dataUrl, "PNG", margin, 16, w, h);
  }

  setFont(8, "normal");
  setText(ink.muted);
  pdf.text(`ORDER REF | ${orderRef}`, pageWidth - margin, 20, { align: "right" });
  pdf.text(`ISSUED | ${orderDateFormatted}`, pageWidth - margin, 25, { align: "right" });

  yPosition = 64;
  setFont(10, "bold");
  setText(brand.yellowDark);
  pdf.text("A-SAFE ORDER FORM", margin, yPosition, { charSpace: 1.5 });

  yPosition += 12;
  setFont(34, "bold");
  setText(ink.heading);
  pdf.text("Workplace Safety", margin, yPosition);
  yPosition += 12;
  pdf.text("Solutions Proposal", margin, yPosition);

  yPosition += 14;
  hr(yPosition, ink.line, 0.5);
  yPosition += 10;

  // Prepared-for client block on the left
  setFont(8, "bold");
  setText(ink.muted);
  pdf.text("PREPARED FOR", margin, yPosition, { charSpace: 1 });
  yPosition += 8;
  setFont(22, "bold");
  setText(ink.black);
  const clientName = orderData.customerCompany || "Client";
  const clientLines = wrap(clientName, contentWidth - 55);
  pdf.text(clientLines[0], margin, yPosition);

  yPosition += 8;
  setFont(11, "normal");
  setText(ink.body);
  if (orderData.customerName) {
    pdf.text(orderData.customerName, margin, yPosition);
    yPosition += 6;
  }
  setFont(10, "normal");
  setText(ink.muted);
  pdf.text(`Project reference: ${orderRef}`, margin, yPosition);
  yPosition += 5;
  pdf.text(`Currency: ${orderData.currency}`, margin, yPosition);

  // Customer logo on the right, same vertical range as the hero block
  if (customerLogo) {
    const maxW = 40,
      maxH = 26;
    const r = customerLogo.width / customerLogo.height;
    const w = r > maxW / maxH ? maxW : maxH * r;
    const h = r > maxW / maxH ? maxW / r : maxH;
    pdf.addImage(customerLogo.dataUrl, "PNG", pageWidth - margin - w, 118, w, h);
  }

  // Bottom contact cards — two columns of "who"
  const contactY = 190;
  hr(contactY);
  const colW = contentWidth / 2 - 5;

  eyebrow("PREPARED FOR", margin, contactY + 8);
  setFont(12, "bold");
  setText(ink.black);
  pdf.text(orderData.customerName || "—", margin, contactY + 15);
  setFont(9, "normal");
  setText(ink.muted);
  let by = contactY + 21;
  if (orderData.customerJobTitle) {
    pdf.text(orderData.customerJobTitle, margin, by);
    by += 5;
  }
  if (orderData.customerCompany) {
    pdf.text(orderData.customerCompany, margin, by);
    by += 5;
  }
  if (orderData.customerEmail) {
    pdf.text(orderData.customerEmail, margin, by);
    by += 5;
  }
  if (orderData.customerMobile) {
    pdf.text(orderData.customerMobile, margin, by);
  }

  const rightX = margin + colW + 10;
  eyebrow("PREPARED BY", rightX, contactY + 8);
  setFont(12, "bold");
  setText(ink.black);
  const repName = orderData.user
    ? `${orderData.user.firstName || ""} ${orderData.user.lastName || ""}`.trim() ||
      orderData.user.email?.split("@")[0] ||
      "A-SAFE Consultant"
    : "A-SAFE Consultant";
  pdf.text(repName, rightX, contactY + 15);
  setFont(9, "normal");
  setText(ink.muted);
  let fy = contactY + 21;
  if (orderData.user?.jobTitle) {
    pdf.text(orderData.user.jobTitle, rightX, fy);
    fy += 5;
  }
  pdf.text(divisionName, rightX, fy);
  fy += 5;
  if (orderData.user?.email) {
    pdf.text(orderData.user.email, rightX, fy);
    fy += 5;
  }
  if (orderData.user?.phone) {
    pdf.text(orderData.user.phone, rightX, fy);
  }

  // Confidentiality strip
  const confY = pageHeight - 24;
  hr(confY, ink.line);
  setFont(8, "bold");
  setText(ink.muted);
  pdf.text("CONFIDENTIAL", margin, confY + 6, { charSpace: 1.5 });
  setFont(8, "normal");
  pdf.text(`${divisionName} | ${orderRef}`, pageWidth / 2, confY + 6, { align: "center" });
  setFont(8, "bold");
  setText(brand.yellowDark);
  pdf.text("www.asafe.com", pageWidth - margin, confY + 6, { align: "right" });

  pageFooter();

  // ═══════════════════════════════════════════════════════════════════
  // PAGE 2+ — CLIENT SUMMARY + PROPOSED SOLUTIONS
  // ═══════════════════════════════════════════════════════════════════
  newPage();
  sectionHeading(
    "Proposed Solutions",
    `${orderData.items.length} product${orderData.items.length === 1 ? "" : "s"} selected for ${
      orderData.customerCompany || "this client"
    }`,
  );

  // Scope rows — mirrors the survey report so both docs have the same feel.
  const scopeRows: Array<[string, string]> = [
    ["Client", orderData.customerCompany || "—"],
    ["Contact", orderData.customerName || "—"],
    ["Order reference", orderRef],
    ["Issue date", orderDateFormatted],
    ["Currency", orderData.currency],
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
  yPosition += 4;
  hr(yPosition, ink.line, 0.5);
  yPosition += 8;

  // ───── Product cards ────────────────────────────────────────────────
  //
  // Left: thumbnail in a 48x70mm frame. Right: name, description, 2-col
  // facts grid (impact, PAS 13, height, variant, material, location), and
  // a qty/price summary row at the bottom. Facts lean on the catalog data
  // we pulled up front.
  const cardHeight = 70;

  for (let i = 0; i < resolvedItems.length; i++) {
    const { item, cat, img } = resolvedItems[i];
    needSpace(cardHeight + 10);

    const cardY = yPosition;
    const imgBoxW = 48;
    const imgBoxH = cardHeight;
    const textX = margin + imgBoxW + 8;
    const textW = contentWidth - imgBoxW - 8;

    setFont(8, "bold");
    setText(brand.yellowDark);
    pdf.text(`SOLUTION ${String(i + 1).padStart(2, "0")}`, margin, cardY - 2);
    hr(cardY, ink.line, 0.3);

    // LEFT — image frame
    if (img) {
      const r = img.width / img.height;
      let iw = imgBoxW;
      let ih = iw / r;
      if (ih > imgBoxH - 4) {
        ih = imgBoxH - 4;
        iw = ih * r;
      }
      const ox = margin + (imgBoxW - iw) / 2;
      const oy = cardY + (imgBoxH - ih) / 2;
      setStroke(ink.line);
      pdf.setLineWidth(0.2);
      pdf.rect(margin, cardY + 2, imgBoxW, imgBoxH - 4);
      try {
        pdf.addImage(img.dataUrl, "JPEG", ox, oy, iw, ih);
      } catch {
        // ignore — broken image encoding, fall through to empty frame
      }
    } else {
      setFill(ink.surface);
      pdf.rect(margin, cardY + 2, imgBoxW, imgBoxH - 4, "F");
      setFont(8, "italic");
      setText(ink.subtle);
      pdf.text("Image unavailable", margin + imgBoxW / 2, cardY + imgBoxH / 2, {
        align: "center",
      });
    }

    // RIGHT — product name + description
    let ty = cardY + 6;
    setFont(13, "bold");
    setText(ink.black);
    const nameLines = wrap(item.productName, textW);
    pdf.text(nameLines[0], textX, ty);
    if (nameLines.length > 1) {
      ty += 5;
      setFont(10, "normal");
      setText(ink.muted);
      pdf.text(nameLines[1], textX, ty);
    }
    ty += 6;

    const description = cat?.description || item.description || "";
    if (description) {
      setFont(8, "normal");
      setText(ink.body);
      const descLines = wrap(description, textW).slice(0, 2);
      pdf.text(descLines, textX, ty);
      ty += descLines.length * 3.8 + 2;
    }

    // Facts grid (2 columns x up to 3 rows)
    const facts: Array<[string, string]> = [];
    const rating = item.impactRating ?? cat?.impactRating;
    if (rating) facts.push(["Impact", `${rating.toLocaleString()} J`]);
    const testJ = cat?.pas13TestJoules;
    if (cat?.pas13Compliant) {
      facts.push([
        "PAS 13",
        testJ
          ? `Certified (${testJ.toLocaleString()} J ${cat.pas13TestMethod || "tested"})`
          : "Certified",
      ]);
    }
    if (cat?.heightMin && cat?.heightMax) {
      facts.push(["Height", `${cat.heightMin}-${cat.heightMax} mm`]);
    } else if (cat?.heightMin) {
      facts.push(["Height", `${cat.heightMin} mm`]);
    }
    if (item.variationDetails) facts.push(["Variant", item.variationDetails]);
    if (item.materialUsed) facts.push(["Material", item.materialUsed]);
    if (item.installationLocation) facts.push(["Location", item.installationLocation]);

    const factColW = textW / 2;
    const factRowH = 8;
    facts.slice(0, 6).forEach((f, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const fx = textX + col * factColW;
      const fy = ty + row * factRowH;
      setFont(7, "bold");
      setText(ink.muted);
      pdf.text(f[0].toUpperCase(), fx, fy, { charSpace: 0.3 });
      setFont(8, "normal");
      setText(ink.body);
      const vLines = wrap(f[1], factColW - 2).slice(0, 1);
      pdf.text(vLines[0], fx, fy + 4);
    });

    // Pricing row at bottom of card
    const priceRowY = cardY + imgBoxH - 6;
    setFont(8, "normal");
    setText(ink.muted);
    const qtyUnit = item.pricingType === "linear_meter" ? "m" : "units";
    pdf.text(`Qty: ${item.quantity} ${qtyUnit}`, textX, priceRowY);
    pdf.text(`Unit: ${money(item.unitPrice)}`, textX + 40, priceRowY);
    setFont(10, "bold");
    setText(ink.black);
    pdf.text(money(item.totalPrice), pageWidth - margin, priceRowY, { align: "right" });

    yPosition = cardY + cardHeight + 6;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SITE REFERENCE PHOTOS — 3-column gallery
  //
  // If uploads carry areaId/productId grouping info we group by it so the
  // user can see which photos belong to which part of the job. Otherwise
  // one flat gallery.
  // ═══════════════════════════════════════════════════════════════════
  if (renderablePhotos.length > 0) {
    newPage();
    sectionHeading(
      "Site Reference Photos",
      `${renderablePhotos.length} captured image${renderablePhotos.length === 1 ? "" : "s"}`,
    );

    const groupKey = (p: LoadedPhoto) => p.src.productId || p.src.areaId || "__default";
    const groups = new Map<string, typeof renderablePhotos>();
    renderablePhotos.forEach((p) => {
      const k = groupKey(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    });

    const renderGallery = (photos: typeof renderablePhotos) => {
      const cols = 3;
      const gap = 4;
      const cellW = (contentWidth - gap * (cols - 1)) / cols;
      const cellH = 44;
      for (let pi = 0; pi < photos.length; pi++) {
        const photo = photos[pi];
        const col = pi % cols;
        const row = Math.floor(pi / cols);

        if (col === 0 && row > 0) {
          yPosition += cellH + 10;
          needSpace(cellH + 12);
        } else if (pi === 0) {
          needSpace(cellH + 12);
        }

        const x = margin + col * (cellW + gap);
        const r = photo.img.width / photo.img.height;
        let ph = cellH;
        let pw = ph * r;
        if (pw > cellW) {
          pw = cellW;
          ph = pw / r;
        }
        const ox = x + (cellW - pw) / 2;
        const oy = yPosition + (cellH - ph) / 2;

        setStroke(ink.line);
        pdf.setLineWidth(0.2);
        pdf.rect(x, yPosition, cellW, cellH);
        try {
          pdf.addImage(photo.img.dataUrl, "JPEG", ox, oy, pw, ph);
        } catch {
          // ignore broken encoding and continue
        }

        setFont(7, "normal");
        setText(ink.muted);
        const caption = photo.src.caption?.trim() || `Photo ${pi + 1}`;
        const capLines = wrap(caption, cellW - 2).slice(0, 1);
        pdf.text(capLines[0], x + 1, yPosition + cellH + 4);
      }
      const rows = Math.ceil(photos.length / cols);
      yPosition += rows * cellH + (rows - 1) * 10 + 8;
    };

    if (groups.size === 1) {
      renderGallery(Array.from(groups.values())[0]);
    } else {
      for (const [key, photos] of groups) {
        needSpace(16);
        if (key !== "__default") {
          eyebrow(`GROUP - ${key.substring(0, 12)}`, margin, yPosition);
          yPosition += 6;
        }
        renderGallery(photos);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // LAYOUT DRAWING
  //
  // Placed BEFORE the order summary so clients see the proposal plan while
  // reviewing the price. Both raster files and PDFs are embedded inline —
  // PDFs get rasterised to a page-1 JPEG during preload (rasterisePdfFirstPage)
  // so the generator sees a uniform image input regardless of source format.
  // The "separate attachment" placeholder is retained purely as a fallback
  // for PDFs that fail to parse (encrypted, corrupt, unsupported fonts).
  // ═══════════════════════════════════════════════════════════════════
  if (fetchedLayout) {
    newPage();
    sectionHeading("Layout Drawing & Barrier Placement", fetchedLayout.drawingTitle || undefined);

    const metaRows: Array<[string, string]> = [];
    if (fetchedLayout.dwgNumber) metaRows.push(["Drawing No.", fetchedLayout.dwgNumber]);
    if (fetchedLayout.revision) metaRows.push(["Revision", fetchedLayout.revision]);
    if (fetchedLayout.drawingScale) metaRows.push(["Scale", fetchedLayout.drawingScale]);
    if (fetchedLayout.drawingDate) metaRows.push(["Date", fetchedLayout.drawingDate]);

    if (metaRows.length) {
      const colCount = metaRows.length;
      const colSpan = contentWidth / colCount;
      metaRows.forEach(([k, v], idx) => {
        const x = margin + idx * colSpan;
        eyebrow(k, x, yPosition);
        setFont(10, "bold");
        setText(ink.black);
        pdf.text(v, x, yPosition + 6);
      });
      yPosition += 12;
      hr(yPosition, ink.line, 0.3);
      yPosition += 6;
    }

    // Upper bounds: 170mm wide matches the A4 content area comfortably
    // with room to spare, 200mm tall keeps us clear of the footer on
    // every layout. availH is our true runtime ceiling — always respect
    // it so tall drawings on a short page don't overflow into the
    // footer.
    const maxDrawingW = Math.min(contentWidth, 170);
    const availH = footerSafeBottom - yPosition - 10;
    const maxDrawingH = Math.min(availH, 200);
    if (layoutDrawingImg) {
      const r = layoutDrawingImg.width / layoutDrawingImg.height;
      // Fit inside max-width AND max-height while preserving aspect
      // ratio — whichever side hits first decides the scale.
      let dw = maxDrawingW;
      let dh = dw / r;
      if (dh > maxDrawingH) {
        dh = maxDrawingH;
        dw = dh * r;
      }
      const ox = margin + (contentWidth - dw) / 2;
      setStroke(ink.line);
      pdf.setLineWidth(0.3);
      pdf.rect(ox - 1, yPosition - 1, dw + 2, dh + 2);
      try {
        pdf.addImage(layoutDrawingImg.dataUrl, "JPEG", ox, yPosition, dw, dh);
      } catch (err) {
        console.warn("[orderFormPdf] layout drawing addImage failed", err);
      }
      yPosition += dh + 6;
      setFont(8, "italic");
      setText(ink.subtle);
      pdf.text(
        `Source file: ${fetchedLayout.fileName}`,
        pageWidth / 2,
        yPosition,
        { align: "center" },
      );
    } else if (fetchedLayout.fileType === "pdf") {
      setFill(brand.yellowSoft);
      pdf.rect(margin, yPosition, contentWidth, 40, "F");
      setFill(brand.yellow);
      pdf.rect(margin, yPosition, 1.5, 40, "F");
      setFont(10, "bold");
      setText(ink.heading);
      pdf.text("Layout drawing available as separate attachment", margin + 6, yPosition + 12);
      setFont(9, "normal");
      setText(ink.body);
      pdf.text(
        `The scaled PDF drawing (${fetchedLayout.fileName}) accompanies this order form`,
        margin + 6,
        yPosition + 20,
      );
      pdf.text(
        `as a separate file to preserve its print fidelity. Please refer to the attached`,
        margin + 6,
        yPosition + 26,
      );
      pdf.text(`PDF for the full-scale barrier placement plan.`, margin + 6, yPosition + 32);
      yPosition += 46;
    } else {
      setFont(9, "italic");
      setText(ink.muted);
      pdf.text("Layout drawing preview unavailable.", margin, yPosition + 4);
      yPosition += 12;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ORDER SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  newPage();
  sectionHeading("Order Summary", "Line-item breakdown and grand total");

  // Table header
  setFill(ink.black);
  pdf.rect(margin, yPosition, contentWidth, 7, "F");
  setFont(7, "bold");
  setText(ink.white);
  const colXs = [margin + 3, margin + 110, margin + 125, margin + 148];
  pdf.text("ITEM", colXs[0], yPosition + 4.8);
  pdf.text("QTY", colXs[1], yPosition + 4.8);
  pdf.text("UNIT PRICE", colXs[2], yPosition + 4.8);
  pdf.text(`TOTAL (${orderData.currency})`, pageWidth - margin - 2, yPosition + 4.8, {
    align: "right",
  });
  yPosition += 7;

  orderData.items.forEach((item, idx) => {
    needSpace(8);
    if (idx % 2 === 0) {
      setFill(ink.surface);
      pdf.rect(margin, yPosition, contentWidth, 7, "F");
    }
    setFont(8, "normal");
    setText(ink.body);
    const nm = item.productName.length > 55 ? item.productName.substring(0, 52) + "..." : item.productName;
    pdf.text(nm, colXs[0], yPosition + 4.8);
    const qtyText = `${item.quantity}${item.pricingType === "linear_meter" ? " m" : ""}`;
    pdf.text(qtyText, colXs[1], yPosition + 4.8);
    pdf.text(money(item.unitPrice), colXs[2], yPosition + 4.8);
    setFont(8, "bold");
    setText(ink.black);
    pdf.text(money(item.totalPrice), pageWidth - margin - 2, yPosition + 4.8, { align: "right" });
    yPosition += 7;
  });

  hr(yPosition, ink.line, 0.5);
  yPosition += 6;

  // Summary / totals block
  const summaryRight = pageWidth - margin - 2;
  const summaryLine = (
    label: string,
    value: string,
    opts: { bold?: boolean; color?: [number, number, number]; sign?: string } = {},
  ) => {
    needSpace(7);
    setFont(9, opts.bold ? "bold" : "normal");
    setText(opts.color || ink.body);
    pdf.text(label, margin, yPosition);
    if (opts.sign === "negative") setText(accent.green);
    pdf.text(value, summaryRight, yPosition, { align: "right" });
    yPosition += 6;
  };

  summaryLine("Goods Total", money(orderData.subtotal), { bold: true, color: ink.black });
  if (orderData.discountAmount > 0) {
    summaryLine("Reciprocal Value Commitments", `- ${money(orderData.discountAmount)}`, {
      sign: "negative",
    });
  }
  if (orderData.partnerDiscountAmount && orderData.partnerDiscountAmount > 0) {
    summaryLine(
      `Partner Rate (${orderData.partnerDiscountPercent || 0}%)`,
      `- ${money(orderData.partnerDiscountAmount)}`,
      { sign: "negative" },
    );
  }
  if (orderData.linkedInDiscountAmount && orderData.linkedInDiscountAmount > 0) {
    const lbl = orderData.linkedInDiscountData?.followers
      ? `LinkedIn Social Reciprocity (${orderData.linkedInDiscountData.followers.toLocaleString()} followers)`
      : "LinkedIn Social Reciprocity";
    summaryLine(lbl, `- ${money(orderData.linkedInDiscountAmount)}`, { sign: "negative" });
  }
  if (orderData.servicePackageCost > 0) {
    summaryLine(orderData.servicePackage || "Service Package", money(orderData.servicePackageCost));
  }
  const deliveryInstall = (orderData.deliveryCharge || 0) + (orderData.installationCharge || 0);
  if (deliveryInstall > 0) {
    summaryLine("Delivery + Installation (door-to-door)", money(deliveryInstall));
  }

  yPosition += 2;
  hr(yPosition, ink.line, 0.5);
  yPosition += 6;

  // Grand Total — subtle yellow bar, not the neon block of v1
  needSpace(14);
  setFill(brand.yellow);
  pdf.rect(margin, yPosition, 1.5, 12, "F");
  setFont(8, "bold");
  setText(ink.muted);
  pdf.text("GRAND TOTAL (EX. VAT)", margin + 5, yPosition + 4, { charSpace: 1 });
  setFont(18, "bold");
  setText(ink.black);
  pdf.text(money(orderData.grandTotal), summaryRight, yPosition + 9, { align: "right" });
  yPosition += 16;

  // ═══════════════════════════════════════════════════════════════════
  // RECIPROCAL VALUE COMMITMENTS — only if any were selected
  // ═══════════════════════════════════════════════════════════════════
  const commitments =
    orderData.reciprocalCommitments?.commitments ||
    orderData.discountDetails ||
    [];
  if (commitments.length > 0 && orderData.discountAmount > 0) {
    newPage();
    sectionHeading(
      "Reciprocal Value Commitments",
      "Obligations unlocked by the applied discounts",
    );

    setFont(9, "normal");
    setText(ink.body);
    const intro =
      "Discounts on this order are unlocked by a set of reciprocal commitments. Each item below shows the commitment, its timeframe, and the discount percentage it unlocks. Non-fulfilment voids the associated discount which then becomes chargeable.";
    const introLines = wrap(intro, contentWidth);
    pdf.text(introLines, margin, yPosition);
    yPosition += introLines.length * 4.5 + 6;

    commitments.forEach((c: any) => {
      needSpace(18);
      const pct = c.discountPercent ?? 0;
      setFill(brand.yellow);
      pdf.rect(margin, yPosition, 1.5, 14, "F");
      setFont(10, "bold");
      setText(ink.black);
      pdf.text(c.title || "Commitment", margin + 5, yPosition + 5);
      setFont(9, "bold");
      setText(brand.yellowDark);
      pdf.text(`${pct}%`, pageWidth - margin, yPosition + 5, { align: "right" });
      if (c.description) {
        setFont(8, "normal");
        setText(ink.muted);
        const dLines = wrap(c.description, contentWidth - 10);
        pdf.text(dLines, margin + 5, yPosition + 10);
        yPosition += 10 + dLines.length * 4 + 4;
      } else {
        yPosition += 16;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TERMS & CONDITIONS
  // ═══════════════════════════════════════════════════════════════════
  newPage();
  sectionHeading("Terms & Conditions", "Commercial terms for this order");

  const headerTerms: Array<[string, string, string]> = [
    ["Order Validity", "30 days", "From date of this order form"],
    ["Lead time", "10-12 weeks", "Subject to availability"],
    ["Payment terms", "50% on confirmation, 50% on delivery + installation", ""],
    ["Warranty", "24 months", "Against manufacturing defects"],
  ];
  headerTerms.forEach(([k, v, note], idx) => {
    needSpace(10);
    if (idx % 2 === 0) {
      setFill(ink.surface);
      pdf.rect(margin, yPosition, contentWidth, 8, "F");
    }
    setFont(8, "bold");
    setText(ink.black);
    pdf.text(k, margin + 3, yPosition + 5);
    setFont(8, "normal");
    setText(ink.body);
    pdf.text(v, margin + 50, yPosition + 5);
    if (note) {
      setFont(8, "italic");
      setText(ink.muted);
      pdf.text(note, pageWidth - margin - 3, yPosition + 5, { align: "right" });
    }
    yPosition += 8;
  });
  yPosition += 6;

  const conditions = [
    "Concrete bases are required where a suitable concrete floor slab is not available; these are excluded from the above quote unless explicitly listed.",
    "It is the client's responsibility to offload materials from the delivery vehicle and to store them in a suitable location at site prior to installation, unless specifically stated otherwise above.",
    "Product images are representational only and may not picture the exact item quoted for.",
    "Our standard products are produced with yellow impact rails and black posts (hazard-warning colouring) for typical internal environments.",
    "Although all products are UV-stabilised for impact performance, the yellow colour is primarily intended for internal use; prolonged direct sunlight may cause some bleaching over time.",
    "If the quoted barrier is for external use in direct sunlight, consider accepting grey or black impact rails.",
    "The above prices include standard zinc-galvanised floor-fixing bolts. Stainless steel, countersunk or chemical fixings are priced separately on request.",
    "We do not accept retention deductions or contractor discounts.",
    "Where installation is unreasonably delayed by the client after delivery (>10 days), A-SAFE reserves the right to issue the final invoice for 100% of the order value.",
    "All products remain the property of A-SAFE until the final invoice has been paid.",
    "A-SAFE is not responsible for removal of existing barriers, bollards or for floor repair works unless specifically listed above.",
  ];

  conditions.forEach((c, idx) => {
    needSpace(10);
    setFont(8, "bold");
    setText(brand.yellowDark);
    pdf.text(String(idx + 1).padStart(2, "0"), margin, yPosition);
    setFont(8, "normal");
    setText(ink.body);
    const lines = wrap(c, contentWidth - 8);
    pdf.text(lines, margin + 6, yPosition);
    yPosition += Math.max(5, lines.length * 3.8) + 2;
  });

  // Reciprocal T&C block (only when applicable)
  if (commitments.length > 0 && orderData.discountAmount > 0) {
    needSpace(20);
    yPosition += 4;
    hr(yPosition, ink.line, 0.5);
    yPosition += 6;
    setFont(10, "bold");
    setText(ink.black);
    pdf.text("Reciprocal Commitment Terms", margin, yPosition);
    yPosition += 6;

    setFont(8, "normal");
    setText(ink.body);
    const reciprocalIntro =
      "Each reciprocal discount below is contingent on the associated commitment being fulfilled within its stated timeframe. Failure to fulfil the commitment voids the discount, which becomes immediately chargeable as an additional fee.";
    wrap(reciprocalIntro, contentWidth).forEach((ln) => {
      needSpace(5);
      pdf.text(ln, margin, yPosition);
      yPosition += 4;
    });
    yPosition += 4;

    // Canonical per-type obligations — inherited from the legacy generator
    // so sales ops's existing terms map forward unchanged.
    const termsTable: Record<string, { timeframe: string; obligations: string[] }> = {
      LOGO_USAGE: {
        timeframe: "30 days",
        obligations: [
          "Provide high-resolution logo files within 30 days of order confirmation.",
          "Grant written permission for A-SAFE to use the logo in marketing materials.",
        ],
      },
      CASE_STUDY: {
        timeframe: "90 days",
        obligations: [
          "Participate in a project interview within 60 days of installation.",
          "Review and approve case study content within 14 days of receipt.",
        ],
      },
      VIDEO_TESTIMONIAL: {
        timeframe: "60 days",
        obligations: [
          "Schedule a filming session within 45 days of installation.",
          "Provide 2-4 hours for professional video production.",
        ],
      },
      SITE_PHOTOGRAPHY: {
        timeframe: "45 days",
        obligations: [
          "Provide site access for photography within 45 days.",
          "Allow 4-6 hours for a comprehensive photo session.",
        ],
      },
      PRESS_RELEASE: {
        timeframe: "60 days",
        obligations: [
          "Collaborate on press-release content within 14 days.",
          "Review and approve the content within 7 business days.",
        ],
      },
      REFERRALS: {
        timeframe: "90 days",
        obligations: [
          "Provide 2-3 qualified warm introductions within 90 days.",
          "Facilitate initial contact and introduction calls.",
        ],
      },
      SERVICE_CONTRACT: {
        timeframe: "30 days",
        obligations: [
          "Sign a multi-year service contract within 30 days.",
          "Maintain the service agreement for a minimum of 2 years.",
        ],
      },
      EXCLUSIVE_SUPPLIER: {
        timeframe: "45 days",
        obligations: [
          "Sign a 24-month exclusive supplier agreement within 45 days.",
          "Commit to a minimum annual spend as agreed in the contract.",
        ],
      },
      ADVANCE_PAYMENT: {
        timeframe: "7 days",
        obligations: [
          "Full 100% payment within 7 days of proforma invoice.",
          "Payment via bank transfer or approved methods only.",
        ],
      },
      FLAGSHIP_SHOWCASE: {
        timeframe: "Ongoing",
        obligations: [
          "Allow the site to be featured as a flagship showcase for 2 years.",
          "Accommodate client visits and tours (max 2 per month).",
        ],
      },
      LINKEDIN_POST: {
        timeframe: "30 days",
        obligations: [
          "Publish an official LinkedIn post within 30 days.",
          "Include A-SAFE project details and tagging.",
        ],
      },
      REFERENCE_SITE: {
        timeframe: "Ongoing",
        obligations: [
          "Allow site visits from potential A-SAFE customers.",
          "Maintain reference availability for 24 months.",
        ],
      },
    };

    commitments.forEach((c: any) => {
      needSpace(18);
      const pct = c.discountPercent ?? 0;
      const terms =
        termsTable[c.optionId || c.id || ""] || {
          timeframe: "As agreed",
          obligations: ["Specific obligations as agreed with A-SAFE."],
        };
      setFont(9, "bold");
      setText(ink.black);
      pdf.text(`- ${c.title || "Commitment"} (${pct}%)`, margin, yPosition);
      yPosition += 5;
      setFont(8, "normal");
      setText(ink.muted);
      pdf.text(`Timeframe: ${terms.timeframe}`, margin + 5, yPosition);
      yPosition += 4;
      setText(ink.body);
      terms.obligations.forEach((o: string) => {
        wrap(`- ${o}`, contentWidth - 10).forEach((ln) => {
          needSpace(5);
          pdf.text(ln, margin + 5, yPosition);
          yPosition += 3.8;
        });
      });
      wrap(
        `- Non-compliance voids the ${pct}% discount, which becomes immediately chargeable.`,
        contentWidth - 10,
      ).forEach((ln) => {
        needSpace(5);
        pdf.text(ln, margin + 5, yPosition);
        yPosition += 3.8;
      });
      yPosition += 3;
    });

    // Important-notice callout
    needSpace(22);
    setFill(brand.yellowSoft);
    pdf.rect(margin, yPosition, contentWidth, 18, "F");
    setFill(brand.yellow);
    pdf.rect(margin, yPosition, 1.5, 18, "F");
    setFont(8, "bold");
    setText(brand.yellowDark);
    pdf.text("IMPORTANT", margin + 5, yPosition + 6, { charSpace: 1 });
    setFont(8, "normal");
    setText(ink.body);
    const notice =
      "Failure to fulfil any reciprocal commitment within its specified timeframe will result in the discount being reversed and charged as an additional fee to the project total. All commitments are binding on order confirmation.";
    const noticeLines = wrap(notice, contentWidth - 30);
    pdf.text(noticeLines, margin + 25, yPosition + 6);
    yPosition += 24;
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTHORIZATION & SIGN-OFF
  //
  // Three blocks (Technical, Commercial, Marketing). Marketing only renders
  // when reciprocal commitments exist. Approvals now happen exclusively in
  // the A-SAFE Engage app — approvers follow a signed link sent by email,
  // which writes to the same /approve-section endpoint used by the live UI.
  // The PDF therefore shows:
  //   - a non-clickable yellow pill nudging the reader to the app, OR
  //   - a permanent "Approved by <name> on <date>" stamp once signed,
  //     followed by a small "Next step: <section> → <email>" hint when
  //     the order object carries a nextApproverEmails entry for the
  //     following section (makes the audit trail self-describing).
  // The mailto flow has been removed intentionally — we want every
  // approval to go through the app so the audit log stays complete.
  // ═══════════════════════════════════════════════════════════════════
  newPage();
  sectionHeading(
    "Authorization & Sign-off",
    "Technical, commercial and marketing approvals",
  );

  // Muted footer note explaining how approvals actually happen. Kept
  // small + italic so it reads as a footnote rather than another heading.
  setFont(8, "italic");
  setText(ink.muted);
  const authNote =
    "Approvals are tracked live in the A-SAFE Engage app with a full audit log. Each approver will receive a secure email link — approvals cannot be completed in this PDF. Valid for 30 days from issue.";
  wrap(authNote, contentWidth).forEach((ln) => {
    pdf.text(ln, margin, yPosition);
    yPosition += 4;
  });
  yPosition += 4;

  // Section → human label lookup used for the "Next step: …" hint. Keep
  // this in sync with the backend's nextApproverEmails keys.
  const sectionLabel: Record<"technical" | "commercial" | "marketing", string> = {
    technical: "Technical",
    commercial: "Commercial",
    marketing: "Marketing",
  };

  const approvalBlock = (
    title: string,
    prefill: SignatureField | undefined,
    nextSection: "technical" | "commercial" | "marketing" | null,
  ) => {
    needSpace(50);
    const blockY = yPosition;
    const blockH = 44;

    setStroke(ink.line);
    pdf.setLineWidth(0.3);
    pdf.rect(margin, blockY, contentWidth, blockH);
    setFill(brand.yellow);
    pdf.rect(margin, blockY, 1.5, blockH, "F");

    setFont(11, "bold");
    setText(ink.black);
    pdf.text(title, margin + 6, blockY + 7);

    // Form field rows
    let rowY = blockY + 16;
    const halfX = margin + contentWidth / 2;
    setFont(8, "bold");
    setText(ink.muted);
    pdf.text("NAME", margin + 6, rowY);
    pdf.text("JOB TITLE", halfX, rowY);

    setStroke(ink.line);
    pdf.setLineWidth(0.3);
    setFont(9, "normal");
    setText(ink.black);
    const name = resolveSignatureName(prefill);
    const jobTitle = resolveSignatureJobTitle(prefill);
    if (name) pdf.text(name, margin + 6, rowY + 5);
    pdf.line(margin + 6, rowY + 6.5, halfX - 8, rowY + 6.5);
    if (jobTitle) pdf.text(jobTitle, halfX, rowY + 5);
    pdf.line(halfX, rowY + 6.5, pageWidth - margin - 36, rowY + 6.5);

    rowY += 11;
    setFont(8, "bold");
    setText(ink.muted);
    pdf.text("MOBILE", margin + 6, rowY);
    pdf.text("DATE", halfX, rowY);
    setFont(9, "normal");
    setText(ink.black);
    const mobile = resolveSignatureMobile(prefill);
    const date = resolveSignatureDate(prefill);
    if (mobile) pdf.text(mobile, margin + 6, rowY + 5);
    pdf.line(margin + 6, rowY + 6.5, halfX - 8, rowY + 6.5);
    if (date) pdf.text(date, halfX, rowY + 5);
    pdf.line(halfX, rowY + 6.5, pageWidth - margin - 36, rowY + 6.5);

    // Right-hand status column: a permanent APPROVED stamp once signed,
    // otherwise a yellow pill telling the reader to use the app.
    // Deliberately NOT a link — see the section comment above.
    const btnX = pageWidth - margin - 30;
    const btnY = blockY + 14;
    const btnW = 26;
    const btnH = 28;

    if (prefill?.signed) {
      setFill(accent.green);
      pdf.roundedRect(btnX, btnY, btnW, btnH, 2, 2, "F");
      setFont(7, "bold");
      setText(ink.white);
      pdf.text("APPROVED", btnX + btnW / 2, btnY + 9, { align: "center" });
      setFont(6, "normal");
      const nameShort = name.length > 14 ? name.substring(0, 12) + "..." : name || "Signed";
      pdf.text(nameShort, btnX + btnW / 2, btnY + 15, { align: "center" });
      if (date) {
        pdf.text(date, btnX + btnW / 2, btnY + 20, { align: "center" });
      }
    } else {
      // Yellow-bg pill spanning the full right column. Plain text, no
      // pdf.link() — we removed the mailto so approvers are forced
      // through the app's secure-link flow.
      setFill(brand.yellow);
      pdf.roundedRect(btnX, btnY, btnW, btnH, 2, 2, "F");
      setFont(7, "bold");
      setText(ink.black);
      // Wrap the CTA over three lines so it fits the 26mm pill comfortably.
      // The "→" is a plain ASCII-safe right-arrow; helvetica renders it
      // via the standard WinAnsi encoding used across this file already.
      pdf.text("Approve live in the", btnX + btnW / 2, btnY + 10, { align: "center" });
      pdf.text("A-SAFE Engage", btnX + btnW / 2, btnY + 15, { align: "center" });
      pdf.text("app \u2192", btnX + btnW / 2, btnY + 20, { align: "center" });
    }

    yPosition = blockY + blockH + 6;

    // Signed-by stamps get a "Next step" hint pointing at the owner of
    // the next section. Only render when (a) the current section is
    // signed, (b) a next section exists, and (c) the backend has told us
    // who owns it — otherwise stay silent rather than show a stub.
    if (prefill?.signed && nextSection) {
      const nextEmail = orderData.nextApproverEmails?.[nextSection];
      if (nextEmail) {
        needSpace(6);
        setFont(8, "normal");
        setText(ink.muted);
        pdf.text(
          `Next step: ${sectionLabel[nextSection]} \u2192 ${nextEmail}`,
          margin,
          yPosition,
        );
        yPosition += 6;
      }
    }
  };

  // Technical → Commercial → (optional) Marketing. The "next section"
  // argument is what we advertise under the signed stamp. Commercial
  // only advertises Marketing when reciprocal commitments are present
  // (otherwise there's no marketing block at all).
  const marketingRequired = commitments.length > 0 && orderData.discountAmount > 0;

  approvalBlock(
    "Technical Approval",
    orderData.technicalSignature,
    "commercial",
  );

  approvalBlock(
    "Commercial Approval",
    orderData.commercialSignature,
    marketingRequired ? "marketing" : null,
  );

  if (marketingRequired) {
    approvalBlock(
      "Marketing Sign-off",
      orderData.marketingSignature,
      null,
    );

    needSpace(12);
    setFont(8, "italic");
    setText(ink.muted);
    const mkt =
      "Marketing sign-off authorises A-SAFE to photograph installed barriers in operation at the customer's facility for marketing purposes, subject to the commitments listed above.";
    wrap(mkt, contentWidth).forEach((ln) => {
      pdf.text(ln, margin, yPosition);
      yPosition += 4;
    });
  }

  // Finalise and save with division-specific filename prefix
  pageFooter();
  const companyPrefix =
    orderData.currency === "SAR"
      ? "A-SAFE-KSA"
      : orderData.currency === "AED"
        ? "A-SAFE-UAE"
        : "A-SAFE";
  const safeOrderRef = orderRef.replace(/[^a-zA-Z0-9_-]/g, "_");
  pdf.save(
    `${companyPrefix}_Order_${safeOrderRef}_${new Date().toISOString().split("T")[0]}.pdf`,
  );
}
