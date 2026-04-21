import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Mail, Building, MapPin, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateOrderFormPDF } from "@/utils/orderFormPdfGenerator";

// ──────────────────────────────────────────────
// /share/order/:token — public, anonymous read-only order view.
//
// Backend gate: GET /api/public/orders/:token. 404 → link was never valid
// (or was revoked); 410 → the link expired. Both render a friendly
// branded "link expired" card with a mailto fallback to quotes@asafe.ae.
// ──────────────────────────────────────────────
interface PublicOrder {
  isPublicView: true;
  orderNumber: string;
  customOrderNumber?: string | null;
  customerCompany?: string | null;
  customerName?: string | null;
  orderDate?: string | null;
  status?: string;
  currency?: string;
  subtotal?: number;
  grandTotal?: number;
  totalAmount?: string;
  deliveryCharge?: number;
  installationCharge?: number;
  installationComplexity?: "simple" | "standard" | "complex";
  items?: any[];
  companyLogoUrl?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  projectDescription?: string | null;
  servicePackage?: any;
  serviceCareDetails?: any;
  applicationAreas?: any;
  layoutMarkups?: any;
  uploadedImages?: any;
  reciprocalCommitments?: { totalDiscountPercent?: number } | null;
  approvalStatus?: Record<string, string>;
  shareTokenExpiresAt?: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; order: PublicOrder }
  | { kind: "expired" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

const CURRENCY_FALLBACK = "AED";

function formatCurrency(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return `${currency} 0.00`;
  return `${currency} ${Number(value).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function groupItemsByZone(items: any[]): Array<{ zone: string; items: any[] }> {
  // Group-by-zone preserves the Quote-to-Supply layout the client expects.
  // Items without an explicit zone land in "Other items".
  const buckets = new Map<string, any[]>();
  for (const item of items || []) {
    const zone = item?.applicationArea || item?.zone || item?.areaName || "Other items";
    if (!buckets.has(zone)) buckets.set(zone, []);
    buckets.get(zone)!.push(item);
  }
  return Array.from(buckets.entries()).map(([zone, items]) => ({ zone, items }));
}

export default function SharedOrderView() {
  const [, params] = useRoute("/share/order/:token");
  const token = params?.token;
  const { toast } = useToast();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ kind: "not_found" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/public/orders/${encodeURIComponent(token)}`);
        if (res.status === 404) {
          if (!cancelled) setState({ kind: "not_found" });
          return;
        }
        if (res.status === 410) {
          if (!cancelled) setState({ kind: "expired" });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as PublicOrder;
        if (!cancelled) setState({ kind: "ok", order: json });
      } catch (err) {
        if (!cancelled) {
          setState({ kind: "error", message: err instanceof Error ? err.message : "Network error" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const currency = state.kind === "ok" ? state.order.currency || CURRENCY_FALLBACK : CURRENCY_FALLBACK;

  const downloadPDF = async () => {
    if (state.kind !== "ok") return;
    const order = state.order;
    try {
      // Build a PDF payload compatible with generateOrderFormPDF using only
      // the sanitised fields the API returned. Missing fields are harmless
      // (the generator tolerates undefined sections).
      const pdfData: any = {
        orderNumber: order.orderNumber,
        customOrderNumber: order.customOrderNumber || undefined,
        customerName: order.customerName || undefined,
        customerCompany: order.customerCompany || undefined,
        orderDate: order.orderDate || new Date().toISOString(),
        items: order.items || [],
        servicePackage: order.servicePackage,
        companyLogoUrl: order.companyLogoUrl || undefined,
        totalAmount: Number(order.totalAmount) || order.grandTotal || 0,
        currency: order.currency || CURRENCY_FALLBACK,
        subtotal: order.subtotal || 0,
        discountAmount: 0,
        servicePackageCost: 0,
        deliveryCharge: order.deliveryCharge || 0,
        installationCharge: order.installationCharge || 0,
        installationComplexity: order.installationComplexity || "standard",
        grandTotal: order.grandTotal || 0,
        layoutMarkups: order.layoutMarkups,
        uploadedImages: order.uploadedImages,
        reciprocalCommitments: order.reciprocalCommitments,
        // Flag the generator this is a public share view — internal code
        // paths that read this flag skip signature / internal blocks.
        isPublicView: true,
      };
      const orderFormatPrice = (v: number) => formatCurrency(v, order.currency || CURRENCY_FALLBACK);
      await generateOrderFormPDF(pdfData, orderFormatPrice);
      toast({ title: "PDF downloaded", description: `Order ${order.orderNumber}` });
    } catch (err) {
      console.error("Public PDF generation failed:", err);
      toast({
        title: "Could not generate PDF",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  // ─── Expired / not found state ──────────────────────────────────────
  if (state.kind === "expired" || state.kind === "not_found") {
    const title = state.kind === "expired" ? "This link has expired" : "Link unavailable";
    const desc =
      state.kind === "expired"
        ? "The share link for this order is no longer valid."
        : "We couldn't find an order for this link. It may have been revoked.";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <img src="/asafe-logo.jpeg" alt="A-SAFE" className="h-10" />
            </div>
            <CardTitle className="text-center text-xl">{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-gray-600">{desc}</p>
            <p className="text-sm text-gray-600">
              Your A-SAFE contact can re-issue a fresh link.
            </p>
            <a
              href="mailto:quotes@asafe.ae"
              className="inline-flex items-center gap-2 bg-[#FFC72C] text-black px-4 py-2 rounded-md font-semibold hover:bg-yellow-300 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Contact quotes@asafe.ae
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────
  if (state.kind === "error") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-gray-600">
            {state.message}. Please retry or contact{" "}
            <a href="mailto:quotes@asafe.ae" className="underline">
              quotes@asafe.ae
            </a>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading order…</div>
      </div>
    );
  }

  // ─── OK state ──────────────────────────────────────────────────────
  const order = state.order;
  const zones = useMemo(() => groupItemsByZone(order.items || []), [order.items]);
  const expiryStr = order.shareTokenExpiresAt
    ? new Date(order.shareTokenExpiresAt).toLocaleDateString()
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <img src="/asafe-logo.jpeg" alt="A-SAFE" className="h-10" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              {order.customerCompany && (
                <div className="text-xl text-gray-800 mb-1">
                  <Building className="h-5 w-5 inline mr-2" />
                  {order.customerCompany}
                </div>
              )}
              {order.projectLocation && (
                <div className="text-lg text-gray-700 mb-1">
                  <MapPin className="h-4 w-4 inline mr-2" />
                  {order.projectLocation}
                </div>
              )}
              {order.projectDescription && (
                <div className="text-base text-gray-600 mb-2 font-normal">
                  <FileText className="h-4 w-4 inline mr-2" />
                  {order.projectDescription}
                </div>
              )}
              <div className="text-lg text-yellow-600 border-t border-gray-200 pt-2 mt-2">
                ORDER FORM
              </div>
            </CardTitle>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-4">
              <div className="flex flex-col items-center sm:items-start gap-2 w-full sm:w-auto">
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className="text-base px-3 py-1">
                    Order #{order.orderNumber}
                  </Badge>
                  {order.customOrderNumber && (
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                      A-SAFE Ref: {order.customOrderNumber}
                    </Badge>
                  )}
                </div>
                {order.orderDate && (
                  <div className="text-sm text-gray-600">
                    Created: {new Date(order.orderDate).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-end w-full sm:w-auto">
                <Button
                  onClick={downloadPDF}
                  className="bg-[#FFC72C] hover:bg-yellow-300 text-black font-semibold"
                  data-testid="button-public-download-pdf"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-gray-700">
            {order.customerName && <div><strong>{order.customerName}</strong></div>}
            {order.customerCompany && <div>{order.customerCompany}</div>}
            {order.projectName && <div>Project: {order.projectName}</div>}
          </CardContent>
        </Card>

        {zones.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {zones.map(({ zone, items }) => (
                <div key={zone}>
                  <div className="text-sm font-semibold text-gray-700 mb-2">{zone}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-2">Product</th>
                          <th className="text-right py-2 px-2">Qty</th>
                          <th className="text-right py-2 px-2">Unit price</th>
                          <th className="text-right py-2 pl-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-b last:border-b-0">
                            <td className="py-2 pr-2">{item.productName || item.name}</td>
                            <td className="py-2 px-2 text-right">{item.quantity || 1}</td>
                            <td className="py-2 px-2 text-right">
                              {formatCurrency(Number(item.unitPrice), currency)}
                            </td>
                            <td className="py-2 pl-2 text-right font-medium">
                              {formatCurrency(Number(item.totalPrice), currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>{formatCurrency(order.subtotal, currency)}</span>
            </div>
            {(order.deliveryCharge || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Delivery</span>
                <span>{formatCurrency(order.deliveryCharge, currency)}</span>
              </div>
            )}
            {(order.installationCharge || 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Installation ({order.installationComplexity || "standard"})</span>
                <span>{formatCurrency(order.installationCharge, currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 mt-2 font-bold text-base">
              <span>Grand total</span>
              <span>{formatCurrency(order.grandTotal, currency)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terms</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-700 space-y-2">
            <p>
              Prices in {currency} and exclude VAT unless otherwise stated. Delivery and
              installation charges are calculated on the order subtotal.
            </p>
            <p>
              For any questions on this quote, please reach out to your A-SAFE contact or
              email{" "}
              <a href="mailto:quotes@asafe.ae" className="underline">
                quotes@asafe.ae
              </a>
              .
            </p>
          </CardContent>
        </Card>

        {expiryStr && (
          <div className="text-center text-xs text-gray-500">
            This link expires on {expiryStr}.
          </div>
        )}
      </div>
    </div>
  );
}
