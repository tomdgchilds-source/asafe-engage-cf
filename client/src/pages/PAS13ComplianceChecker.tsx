// ────────────────────────────────────────────────────────────────────────────
// PAS 13:2017 Alignment Checker
//
// Wired to:
//   - /api/active-project            → current project (for vehicle context)
//   - /api/cart                      → user's cart line items (per-product
//                                      verdicts)
//   - /api/calculations              → project's impact calculations (for
//                                      the heaviest vehicle fallback)
//
// Verdicts are computed on-demand client-side via shared/pas13Rules.ts — no
// new persistence. Wording is locked: "PAS 13 aligned" / "borderline
// alignment" / "not PAS 13 aligned" — never "compliant".
//
// The legacy manual-entry UI (height, deflection, test method etc.) is
// retained below the cart audit as a standalone tool. Users still land here
// from a project, see an auto-audit, and can drop into the manual form if
// they want to sanity-check a spec outside the catalogue.
// ────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Ruler,
  Truck,
  Building,
  Info,
  FileText,
  Download,
} from "lucide-react";
import { Pas13VerdictPanel } from "@/components/Pas13VerdictPanel";
import {
  pas13Verdict,
  PAS13_INDICATIVE_FOOTNOTE,
  PAS13_VERSION,
  type Pas13Verdict,
  type Verdict,
} from "@shared/pas13Rules";

// ─── Types the endpoints return (subset the page actually reads) ──────────
interface CartLineItem {
  id: string;
  productName: string;
  quantity: number;
  impactRating?: number | null;
  pricingTier?: string | null;
  calculationContext?: {
    vehicleMass?: number | string;
    loadMass?: number | string;
    speed?: number | string;
    speedUnit?: string;
    impactAngle?: number | string;
    kineticEnergy?: number | string;
  } | null;
}

interface ImpactCalculation {
  id: string;
  vehicleMass: string | number;
  loadMass: string | number;
  speed: string | number;
  speedUnit: string;
  impactAngle: string | number;
  kineticEnergy: string | number;
  operatingZone?: string;
}

interface ProductRow {
  id: string;
  name: string;
  impactRating?: number | null;
  deflectionZone?: number | null;
  pas13TestJoules?: number | null;
  impactTestingData?: {
    impactZone?: string | null;
  } | null;
}

interface ActiveProject {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toSpeedKmh(speed: number, unit: string | undefined): number {
  if (!unit || unit === "kmh") return speed;
  if (unit === "mph") return speed * 1.60934;
  if (unit === "ms") return speed * 3.6;
  return speed;
}

function parseImpactZoneMm(
  raw: string | null | undefined,
  fallbackDeflectionZone?: number | null,
): number {
  if (typeof fallbackDeflectionZone === "number" && fallbackDeflectionZone > 0) {
    return fallbackDeflectionZone;
  }
  if (!raw) return 200; // conservative default
  // Accept "250 mm", "250mm", "0-250", "0–250 mm" etc.
  const m = String(raw).match(/(\d{1,5})(?=\s*mm|$|\D)/g);
  if (!m || m.length === 0) return 200;
  const maxVal = Math.max(...m.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n)));
  return Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 200;
}

function worstVerdict(a: Verdict, b: Verdict): Verdict {
  const order: Record<Verdict, number> = { aligned: 0, borderline: 1, not_aligned: 2 };
  return order[a] >= order[b] ? a : b;
}

// ─── Vehicle-context resolver ─────────────────────────────────────────────
// Prefer the cart line's own calculationContext (what the user saw when
// adding this item). Fallback: the heaviest vehicle across the project's
// impact calculations. Final fallback: a conservative forklift-sized
// stand-in so the panel never renders empty.
function resolveVehicleContext(
  item: CartLineItem,
  projectCalcs: ImpactCalculation[],
): {
  vehicleMassKg: number;
  loadMassKg: number;
  speedKmh: number;
  approachAngleDeg: number;
  source: "lineItem" | "heaviestProjectVehicle" | "fallback";
} {
  const ctx = item.calculationContext;
  if (
    ctx &&
    (toNum(ctx.vehicleMass) > 0 || toNum(ctx.loadMass) > 0) &&
    toNum(ctx.speed) > 0
  ) {
    return {
      vehicleMassKg: toNum(ctx.vehicleMass),
      loadMassKg: toNum(ctx.loadMass),
      speedKmh: toSpeedKmh(toNum(ctx.speed), ctx.speedUnit),
      approachAngleDeg: toNum(ctx.impactAngle) || 90,
      source: "lineItem",
    };
  }
  // Heaviest vehicle in the project.
  if (projectCalcs.length > 0) {
    const heaviest = [...projectCalcs].sort(
      (a, b) => toNum(b.vehicleMass) + toNum(b.loadMass) - (toNum(a.vehicleMass) + toNum(a.loadMass)),
    )[0];
    return {
      vehicleMassKg: toNum(heaviest.vehicleMass),
      loadMassKg: toNum(heaviest.loadMass),
      speedKmh: toSpeedKmh(toNum(heaviest.speed), heaviest.speedUnit),
      approachAngleDeg: toNum(heaviest.impactAngle) || 90,
      source: "heaviestProjectVehicle",
    };
  }
  return {
    vehicleMassKg: 5000,
    loadMassKg: 1000,
    speedKmh: 10,
    approachAngleDeg: 90,
    source: "fallback",
  };
}

// ─── Legacy-form check type (retained for the manual tab) ─────────────────
interface ComplianceCheck {
  section: string;
  requirement: string;
  verdict: Verdict;
  notes?: string;
}

export function PAS13ComplianceChecker() {
  // ─── Live data fetches ──────────────────────────────────────────────
  const { data: activeProject } = useQuery<ActiveProject | null>({
    queryKey: ["/api/active-project"],
    queryFn: async () => {
      const res = await fetch("/api/active-project", { credentials: "include" });
      if (!res.ok) return null;
      return (await res.json()) as ActiveProject | null;
    },
  });

  const { data: cartItems = [] } = useQuery<CartLineItem[]>({
    queryKey: ["/api/cart"],
    queryFn: async () => {
      const res = await fetch("/api/cart", { credentials: "include" });
      if (!res.ok) return [];
      const data = (await res.json()) as CartLineItem[] | { items?: CartLineItem[] };
      return Array.isArray(data) ? data : (data as { items?: CartLineItem[] }).items || [];
    },
  });

  const { data: projectCalcs = [] } = useQuery<ImpactCalculation[]>({
    queryKey: ["/api/calculations"],
    queryFn: async () => {
      const res = await fetch("/api/calculations", { credentials: "include" });
      if (!res.ok) return [];
      const data = (await res.json()) as ImpactCalculation[];
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: allProducts = [] } = useQuery<ProductRow[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products", { credentials: "include" });
      if (!res.ok) return [];
      const data = (await res.json()) as ProductRow[] | { products?: ProductRow[] };
      return Array.isArray(data) ? data : (data as { products?: ProductRow[] }).products || [];
    },
  });

  const productsByName = useMemo(() => {
    const m = new Map<string, ProductRow>();
    for (const p of allProducts) m.set(p.name.toLowerCase(), p);
    return m;
  }, [allProducts]);

  // ─── Per-line-item verdicts ─────────────────────────────────────────
  const lineItemVerdicts = useMemo(() => {
    return cartItems.map((item) => {
      const product = productsByName.get(item.productName.toLowerCase());
      const rated =
        product?.impactRating ??
        item.impactRating ??
        product?.pas13TestJoules ??
        0;
      const impactZoneMm = parseImpactZoneMm(
        product?.impactTestingData?.impactZone ?? null,
        product?.deflectionZone ?? null,
      );
      const ctx = resolveVehicleContext(item, projectCalcs);
      const verdict = pas13Verdict({
        vehicleMassKg: ctx.vehicleMassKg,
        loadMassKg: ctx.loadMassKg,
        speedKmh: ctx.speedKmh,
        approachAngleDeg: ctx.approachAngleDeg,
        productRatedJoulesAt45deg: Number(rated) || 0,
        productImpactZoneMaxMm: impactZoneMm,
        measuredDeflectionZoneMm: null,
      });
      return { item, verdict, contextSource: ctx.source };
    });
  }, [cartItems, projectCalcs, productsByName]);

  const aggregateVerdict: Verdict | null = useMemo(() => {
    if (lineItemVerdicts.length === 0) return null;
    return lineItemVerdicts.reduce<Verdict>(
      (acc, cur) => worstVerdict(acc, cur.verdict.verdict),
      "aligned",
    );
  }, [lineItemVerdicts]);

  const aggregateLabel =
    aggregateVerdict === "aligned"
      ? "PAS 13 aligned"
      : aggregateVerdict === "borderline"
        ? "Borderline alignment"
        : aggregateVerdict === "not_aligned"
          ? "Not PAS 13 aligned"
          : null;

  // ─── Legacy manual checker (kept for one-off spec checks) ───────────
  const [barrierHeight, setBarrierHeight] = useState<string>("");
  const [deflectionZone, setDeflectionZone] = useState<string>("");
  const [applicationType, setApplicationType] = useState<string>("");
  const [pedestrianAccess, setPedestrianAccess] = useState<string>("");
  const [vehicleType, setVehicleType] = useState<string>("");
  const [aisleWidth, setAisleWidth] = useState<string>("");
  const [testMethod, setTestMethod] = useState<string>("");
  const [testJoules, setTestJoules] = useState<string>("");

  const [complianceResults, setComplianceResults] = useState<ComplianceCheck[]>([]);
  const [manualOverall, setManualOverall] = useState<Verdict | null>(null);

  const checkCompliance = () => {
    const checks: ComplianceCheck[] = [];

    if (barrierHeight) {
      const height = parseFloat(barrierHeight);
      const vehicleOk = vehicleType !== "forklift" || height >= 400;
      const pedOk = pedestrianAccess !== "yes" || height >= 1100;

      checks.push({
        section: "5.1",
        requirement: "Barrier height appropriate for vehicle type",
        verdict: vehicleOk ? "aligned" : "not_aligned",
        notes:
          vehicleType === "forklift"
            ? `Minimum 400mm for forklifts (current: ${height}mm)`
            : undefined,
      });

      if (pedestrianAccess === "yes") {
        checks.push({
          section: "5.2",
          requirement: "Hand rail height (1100mm) for pedestrian areas",
          verdict: pedOk ? "aligned" : "not_aligned",
          notes: `Current height: ${height}mm, PAS 13 §5.14: 1100mm minimum`,
        });
      }
    }

    if (deflectionZone) {
      const zone = parseFloat(deflectionZone);
      const aligned = zone >= 600;
      const borderline = zone >= 300 && zone < 600;
      checks.push({
        section: "5.10",
        requirement: "Deflection zone ≥ 600mm (§5.10 + §5.9 pedestrian zone)",
        verdict: aligned ? "aligned" : borderline ? "borderline" : "not_aligned",
        notes: `Deflection zone: ${zone}mm — §5.10 requires max deflection + 600mm`,
      });
    }

    if (testMethod) {
      checks.push({
        section: "7",
        requirement: "Test method is one of PAS 13 §7 pendulum/vehicle/sled",
        verdict: ["pendulum", "vehicle", "sled"].includes(testMethod)
          ? "aligned"
          : "not_aligned",
        notes: `Test method: ${testMethod}`,
      });
    }

    if (testJoules) {
      const j = parseFloat(testJoules);
      checks.push({
        section: "7.4.6",
        requirement: "Test energy positive (PAS 13 §7.4.6 5% test safety factor)",
        verdict: j > 0 ? "aligned" : "not_aligned",
        notes: `Rated energy: ${j.toLocaleString()}J`,
      });
    }

    if (aisleWidth) {
      const width = parseFloat(aisleWidth);
      const vehicleWidth = 1.2;
      const maxAngle = (Math.atan((width - vehicleWidth) / 2.5) * 180) / Math.PI;
      const okWidth = width >= 3.0;
      checks.push({
        section: "6.2",
        requirement: "Aisle width permits vehicle operation (§6.2 Fig. 17)",
        verdict: okWidth ? "aligned" : "borderline",
        notes: `Aisle width: ${width}m, max impact angle: ${maxAngle.toFixed(1)}°`,
      });
    }

    setComplianceResults(checks);
    const agg = checks.reduce<Verdict | null>(
      (acc, c) => (acc === null ? c.verdict : worstVerdict(acc, c.verdict)),
      null,
    );
    setManualOverall(agg);
  };

  // ─── Report generator (HTML) ────────────────────────────────────────
  const generateReport = () => {
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (m) =>
        m === "&" ? "&amp;" : m === "<" ? "&lt;" : m === ">" ? "&gt;" : m === '"' ? "&quot;" : "&#39;",
      );
    const rows = lineItemVerdicts
      .map(({ item, verdict }) => {
        const cites = verdict.citations
          .map((c) => `<a href="${c.url}">${esc(c.shortLabel)}</a>`)
          .join(" ");
        return `
          <tr>
            <td>${esc(item.productName)}</td>
            <td>${esc(verdict.verdict.toUpperCase().replace("_", " "))}</td>
            <td>${verdict.details.requiredJoulesAt45deg.toLocaleString()} J</td>
            <td>${verdict.details.productRatedJoulesAt45deg.toLocaleString()} J</td>
            <td>${verdict.details.safetyMarginPct.toFixed(1)}%</td>
            <td>${cites}</td>
            <td>${esc(verdict.summary)}</td>
          </tr>
        `;
      })
      .join("\n");
    const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>PAS 13 Aligned Report — ${esc(activeProject?.name || "Project")}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 32px; color: #1f2937; }
  h1 { margin-bottom: 4px; }
  .meta { color: #6b7280; margin-bottom: 24px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e5e7eb; padding: 8px 10px; font-size: 12px; vertical-align: top; }
  th { background: #f9fafb; text-align: left; }
  .aligned { color: #065f46; }
  .borderline { color: #92400e; }
  .not_aligned { color: #991b1b; }
  .footnote { color: #6b7280; font-style: italic; font-size: 11px; margin-top: 24px; }
</style>
</head><body>
  <h1>PAS 13:2017 Alignment Report</h1>
  <p class="meta">Project: <strong>${esc(activeProject?.name || "—")}</strong><br/>
    Generated: ${new Date().toISOString().slice(0, 10)}<br/>
    Standard version: <strong>${esc(PAS13_VERSION)}</strong><br/>
    Aggregate verdict: <strong class="${aggregateVerdict || ""}">${esc(aggregateLabel || "No cart items to audit")}</strong>
  </p>
  <table>
    <thead><tr>
      <th>Product</th><th>Verdict</th><th>Required (at 45°)</th>
      <th>Product rated (at 45°)</th><th>Safety margin</th>
      <th>Cited sections</th><th>Summary</th>
    </tr></thead>
    <tbody>${rows || "<tr><td colspan='7'>No cart items</td></tr>"}</tbody>
  </table>
  <p class="footnote">${esc(PAS13_INDICATIVE_FOOTNOTE)}</p>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PAS13_Aligned_Report_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-[#FFC72C]" />
        <div>
          <h1 className="text-3xl font-bold">PAS 13:2017 Alignment Checker</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Automatic audit of the items in your active project against PAS 13:2017.
          </p>
        </div>
      </div>

      <Alert className="bg-[#FFC72C]/10 dark:bg-[#FFC72C]/20 border-[#FFC72C]/30 dark:border-[#FFC72C]/40">
        <Info className="h-4 w-4 text-[#FFC72C]" />
        <AlertTitle className="text-gray-900 dark:text-white font-semibold">About PAS 13:2017</AlertTitle>
        <AlertDescription className="text-gray-700 dark:text-gray-300">
          PAS 13:2017 is the British Standard code of practice for safety barriers used in traffic
          management within workplace environments. This tool calls the standard "PAS 13 aligned"
          or "not PAS 13 aligned" rather than "compliant" to avoid implying a commercial-liability
          claim — results are indicative. {PAS13_INDICATIVE_FOOTNOTE}
        </AlertDescription>
      </Alert>

      {/* ─── Aggregate project verdict ─── */}
      {aggregateVerdict && (
        <Card
          className={`border-2 ${
            aggregateVerdict === "aligned"
              ? "border-green-400"
              : aggregateVerdict === "borderline"
                ? "border-yellow-500"
                : "border-red-500"
          }`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              {aggregateVerdict === "aligned" ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : aggregateVerdict === "borderline" ? (
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600" />
              )}
              <span>Project aggregate: {aggregateLabel}</span>
              <Badge className="ml-auto">{lineItemVerdicts.length} line items</Badge>
            </CardTitle>
            <CardDescription>
              Worst-of across all items in {activeProject?.name || "the active project"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={generateReport}
              variant="outline"
              className="w-full"
              data-testid="pas13-generate-report"
              disabled={lineItemVerdicts.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Generate PAS 13 Aligned Report
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Per-line-item audit ─── */}
      {lineItemVerdicts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Line-item alignment audit
            </CardTitle>
            <CardDescription>
              Each item is checked against the vehicle context for its cart line (falling back to
              the heaviest project vehicle when the line has none).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lineItemVerdicts.map(({ item, verdict, contextSource }) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{item.productName} × {item.quantity}</p>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    Vehicle context:{" "}
                    {contextSource === "lineItem"
                      ? "from cart line"
                      : contextSource === "heaviestProjectVehicle"
                        ? "heaviest project vehicle"
                        : "default fallback"}
                  </span>
                </div>
                <Pas13VerdictPanel verdict={verdict} compact />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-gray-500 dark:text-gray-400">
            <Shield className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p>Your active-project cart is empty — add a product to run an audit.</p>
          </CardContent>
        </Card>
      )}

      {/* ─── Manual checker (legacy surface kept as a power-user tool) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Manual spec checker
          </CardTitle>
          <CardDescription>
            Check a single barrier spec against PAS 13 sections without adding it to the cart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="dimensions" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
              <TabsTrigger value="application">Application</TabsTrigger>
              <TabsTrigger value="testing">Testing</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
            </TabsList>

            <TabsContent value="dimensions" className="space-y-4">
              <div>
                <Label htmlFor="barrier-height">Barrier Height (mm)</Label>
                <Input
                  id="barrier-height"
                  type="number"
                  value={barrierHeight}
                  onChange={(e) => setBarrierHeight(e.target.value)}
                  placeholder="e.g., 400"
                />
                <p className="text-sm text-gray-500 mt-1">§5.4 + §5.14 pedestrian 1100mm minimum</p>
              </div>
              <div>
                <Label htmlFor="deflection-zone">Deflection Zone (mm)</Label>
                <Input
                  id="deflection-zone"
                  type="number"
                  value={deflectionZone}
                  onChange={(e) => setDeflectionZone(e.target.value)}
                  placeholder="e.g., 750"
                />
                <p className="text-sm text-gray-500 mt-1">
                  §5.10: max deflection + 600 mm pedestrian safe zone
                </p>
              </div>
              <div>
                <Label htmlFor="aisle-width">Aisle Width (meters)</Label>
                <Input
                  id="aisle-width"
                  type="number"
                  step="0.1"
                  value={aisleWidth}
                  onChange={(e) => setAisleWidth(e.target.value)}
                  placeholder="e.g., 3.5"
                />
                <p className="text-sm text-gray-500 mt-1">§6.2 Fig. 17 max impact angle</p>
              </div>
            </TabsContent>

            <TabsContent value="application" className="space-y-4">
              <div>
                <Label htmlFor="application-type">Application Type</Label>
                <Select value={applicationType} onValueChange={setApplicationType}>
                  <SelectTrigger id="application-type">
                    <SelectValue placeholder="Select application..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="column-protection">Column Protection</SelectItem>
                    <SelectItem value="pedestrian-walkway">Pedestrian Walkway</SelectItem>
                    <SelectItem value="vehicle-route">Vehicle Route</SelectItem>
                    <SelectItem value="crossing-point">Crossing Point</SelectItem>
                    <SelectItem value="loading-dock">Loading Dock</SelectItem>
                    <SelectItem value="equipment-protection">Equipment Protection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="pedestrian-access">Pedestrian Access Required?</Label>
                <Select value={pedestrianAccess} onValueChange={setPedestrianAccess}>
                  <SelectTrigger id="pedestrian-access">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes — Pedestrians present</SelectItem>
                    <SelectItem value="no">No — Vehicle only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  §5.14: 1100mm handrails when pedestrians may work in the area
                </p>
              </div>

              <div>
                <Label htmlFor="vehicle-type">Primary Vehicle Type</Label>
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger id="vehicle-type">
                    <SelectValue placeholder="Select vehicle..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forklift">Forklift</SelectItem>
                    <SelectItem value="pallet-truck">Pallet Truck</SelectItem>
                    <SelectItem value="reach-truck">Reach Truck</SelectItem>
                    <SelectItem value="tugger">Tugger Train</SelectItem>
                    <SelectItem value="agv">AGV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="testing" className="space-y-4">
              <div>
                <Label htmlFor="test-method">Test Method</Label>
                <Select value={testMethod} onValueChange={setTestMethod}>
                  <SelectTrigger id="test-method">
                    <SelectValue placeholder="Select test method..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendulum">Pendulum (§7.5)</SelectItem>
                    <SelectItem value="vehicle">Vehicle (§7.6)</SelectItem>
                    <SelectItem value="sled">Sled and ramp (§7.7)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="test-joules">Test Impact Energy (Joules)</Label>
                <Input
                  id="test-joules"
                  type="number"
                  value={testJoules}
                  onChange={(e) => setTestJoules(e.target.value)}
                  placeholder="e.g., 12500"
                />
                <p className="text-sm text-gray-500 mt-1">Joules certified per §7.4.6 5% safety factor</p>
              </div>

              <Button
                onClick={checkCompliance}
                className="w-full bg-[#FFC72C] hover:bg-[#FFB700] text-black font-semibold"
              >
                <Shield className="h-4 w-4 mr-2" />
                Run manual PAS 13 check
              </Button>
            </TabsContent>

            <TabsContent value="results" className="space-y-4">
              {complianceResults.length > 0 ? (
                <div className="space-y-3">
                  {manualOverall && (
                    <div className="p-3 rounded-lg border flex items-center gap-2">
                      {manualOverall === "aligned" ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : manualOverall === "borderline" ? (
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-semibold">
                        {manualOverall === "aligned"
                          ? "PAS 13 aligned"
                          : manualOverall === "borderline"
                            ? "Borderline alignment"
                            : "Not PAS 13 aligned"}
                      </span>
                    </div>
                  )}

                  {complianceResults.map((check, idx) => (
                    <div key={idx} className="p-3 rounded-lg border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {check.verdict === "aligned" ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            )}
                            <span className="font-medium">§{check.section}</span>
                            <Badge
                              className={
                                check.verdict === "aligned"
                                  ? "bg-green-100 text-green-800"
                                  : check.verdict === "borderline"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
                              }
                            >
                              {check.verdict === "aligned"
                                ? "Aligned"
                                : check.verdict === "borderline"
                                  ? "Borderline"
                                  : "Not aligned"}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {check.requirement}
                          </p>
                          {check.notes && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {check.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  <p className="text-[11px] italic text-gray-500 dark:text-gray-400">
                    {PAS13_INDICATIVE_FOOTNOTE}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Ruler className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  <p>Fill in dimensions / application / testing and run the manual check.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
