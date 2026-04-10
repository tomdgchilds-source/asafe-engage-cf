// cart-pricing.ts

/**
 * Safely get number
 */
const num = (v: any, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);

/**
 * Clamp value between [min, max]
 */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export interface LineItem {
  qty: number;
  unit_price: number;
  totals?: {
    line_subtotal: number;
    line_discount: number;
    line_total: number;
  };
}

export interface ReciprocalCommitmentItem {
  id: string;
  title: string;
  description: string;
  discount_percent: number;
  selected: boolean;
}

export interface ReciprocalCommitments {
  items: ReciprocalCommitmentItem[];
  max_discount_percent?: number;
  selected_discount_percent_sum?: number;
  applied_discount_percent?: number;
}

export interface ServiceTier {
  id: string;
  name: string;
  chargeable: boolean;
  annual_cost_type: "fixed" | "percent_of_project_value";
  annual_cost_value: number;
}

export interface ServicePackage {
  selected_tier: string;
  contract_years: number;
  tiers: ServiceTier[];
  annual_cost_computed?: number;
  total_service_value?: number;
}

export interface DeliveryInstallation {
  delivery_cost: number;
  installation_cost: number;
}

export interface Taxes {
  vat_percent: number;
  apply_vat_to: string[];
}

export interface Rules {
  max_total_discount_percent: number;
  allow_offset_of_service_package_with_discounts: boolean;
}

export interface CartTotals {
  products_subtotal: number;
  delivery_cost: number;
  installation_cost: number;
  service_package_total: number;
  reciprocal_discount_percent: number;
  products_discount_value: number;
  service_discount_value: number;
  gross_subtotal_before_discount: number;
  gross_subtotal_after_discount: number;
  vat_value: number;
  grand_total: number;
}

export interface Cart {
  line_items: LineItem[];
  reciprocal_commitments?: ReciprocalCommitments;
  service_package?: ServicePackage;
  delivery_installation?: DeliveryInstallation;
  taxes?: Taxes;
  rules?: Rules;
  totals?: CartTotals;
}

/**
 * Compute line totals (subtotal = qty * unit_price)
 */
function computeLineTotals(line: LineItem) {
  const qty = num(line.qty);
  const unit = num(line.unit_price);
  const subtotal = qty * unit;
  return {
    line_subtotal: +subtotal.toFixed(2),
    line_discount: 0,
    line_total: +subtotal.toFixed(2),
  };
}

/**
 * Sum products_subtotal from line_items (and fill each line.totals if missing)
 */
function computeProductsSubtotal(line_items: LineItem[] = []) {
  let sum = 0;
  for (const li of line_items) {
    if (!li.totals) li.totals = {} as any;
    const t = computeLineTotals(li);
    li.totals = { ...li.totals, ...t };
    sum += t.line_total;
  }
  return +sum.toFixed(2);
}

/**
 * Calculate selected reciprocal discount percent (capped by rules.max_total_discount_percent)
 */
function computeReciprocalPercent(cart: Cart) {
  const items = cart?.reciprocal_commitments?.items || [];
  const selectedSum = items
    .filter(i => i.selected)
    .reduce((a, b) => a + num(b.discount_percent), 0);

  const cap = num(
    cart?.rules?.max_total_discount_percent ??
      cart?.reciprocal_commitments?.max_discount_percent,
    20
  );

  const applied = clamp(selectedSum, 0, cap);
  // write back (optional)
  if (cart.reciprocal_commitments) {
    cart.reciprocal_commitments = {
      ...(cart.reciprocal_commitments || {}),
      selected_discount_percent_sum: +selectedSum.toFixed(2),
      applied_discount_percent: +applied.toFixed(2),
    };
  }
  return applied;
}

/**
 * Compute service package cost.
 * - If type = "percent_of_project_value", base = products_subtotal (common in your use-case)
 * - If type = "fixed", base = annual_cost_value
 */
function computeServiceCost(cart: Cart, productsSubtotal: number) {
  const svc = cart?.service_package || {} as ServicePackage;
  const tiers = svc.tiers || [];
  const selId = (svc.selected_tier || "essential").toLowerCase();
  const tier = tiers.find(t => t.id === selId) || { chargeable: false, annual_cost_type: "fixed" as const, annual_cost_value: 0 };
  const years = num(svc.contract_years, 1);

  let annual = 0;
  if (!tier.chargeable) {
    annual = 0;
  } else if ((tier.annual_cost_type || "").includes("percent")) {
    const pct = num(tier.annual_cost_value, 0) / 100;
    annual = productsSubtotal * pct;
  } else {
    annual = num(tier.annual_cost_value, 0);
  }

  const total = annual * years;

  // write back (optional)
  if (cart.service_package) {
    cart.service_package = {
      ...svc,
      annual_cost_computed: +annual.toFixed(2),
      total_service_value: +total.toFixed(2),
    };
  }

  return { annual: +annual.toFixed(2), total: +total.toFixed(2) };
}

/**
 * Compute VAT for selected buckets after discounts
 */
function computeVAT(cart: Cart, buckets: Record<string, number>) {
  const vatPct = num(cart?.taxes?.vat_percent, 0) / 100;
  const applyTo = new Set(cart?.taxes?.apply_vat_to || []);
  let base = 0;
  for (const [bucketName, value] of Object.entries(buckets)) {
    if (applyTo.has(bucketName)) base += num(value);
  }
  return +((base) * vatPct).toFixed(2);
}

/**
 * Main entry — computes and writes cart.totals
 * Rules:
 *  - Discounts apply to products_subtotal only (always)
 *  - If rules.allow_offset_of_service_package_with_discounts === true,
 *    also apply the same discount percent to the service_package_total
 */
export function computeCartTotals(cart: Cart): Cart {
  // 1) Products
  const products_subtotal = computeProductsSubtotal(cart.line_items);

  // 2) Delivery/Install (un-discounted)
  const delivery_cost = num(cart?.delivery_installation?.delivery_cost);
  const installation_cost = num(cart?.delivery_installation?.installation_cost);

  // 3) Service package
  const { total: service_package_total } = computeServiceCost(cart, products_subtotal);

  // 4) Reciprocal discount percent (capped)
  const appliedPct = computeReciprocalPercent(cart) / 100;

  // 5) Apply discounts
  const products_discount_value = +(products_subtotal * appliedPct).toFixed(2);

  let service_discount_value = 0;
  const allowSvcOffset = !!cart?.rules?.allow_offset_of_service_package_with_discounts;
  if (allowSvcOffset && service_package_total > 0) {
    service_discount_value = +(service_package_total * appliedPct).toFixed(2);
  }

  const products_after_discount = +(products_subtotal - products_discount_value).toFixed(2);
  const service_after_discount = +(service_package_total - service_discount_value).toFixed(2);

  // 6) Gross subtotals
  const gross_subtotal_before_discount = +(
    products_subtotal + delivery_cost + installation_cost + service_package_total
  ).toFixed(2);

  const gross_subtotal_after_discount = +(
    products_after_discount + delivery_cost + installation_cost + service_after_discount
  ).toFixed(2);

  // 7) VAT
  const vat_value = computeVAT(cart, {
    products: products_after_discount,
    delivery: delivery_cost,
    installation: installation_cost,
    service_package: service_after_discount
  });

  // 8) Grand total
  const grand_total = +(gross_subtotal_after_discount + vat_value).toFixed(2);

  // 9) Write totals back to cart
  cart.totals = {
    products_subtotal: +products_subtotal.toFixed(2),
    delivery_cost: +delivery_cost.toFixed(2),
    installation_cost: +installation_cost.toFixed(2),
    service_package_total: +service_package_total.toFixed(2),

    reciprocal_discount_percent: +(appliedPct * 100).toFixed(2),
    products_discount_value: +products_discount_value.toFixed(2),
    service_discount_value: +service_discount_value.toFixed(2),

    gross_subtotal_before_discount: +gross_subtotal_before_discount.toFixed(2),
    gross_subtotal_after_discount: +gross_subtotal_after_discount.toFixed(2),

    vat_value: +vat_value.toFixed(2),
    grand_total: +grand_total.toFixed(2)
  };

  return cart;
}

// Default reciprocal commitment options for A-SAFE
export const DEFAULT_RECIPROCAL_COMMITMENTS: ReciprocalCommitmentItem[] = [
  {
    id: "annual_maintenance",
    title: "Annual Maintenance Agreement",
    description: "Commit to annual professional maintenance service",
    discount_percent: 5.0,
    selected: false,
  },
  {
    id: "multi_site",
    title: "Multi-Site Installation",
    description: "Install at 3+ locations within 12 months",
    discount_percent: 7.5,
    selected: false,
  },
  {
    id: "volume_commitment",
    title: "Volume Commitment (500+ meters)",
    description: "Commit to ordering 500+ linear meters over 24 months",
    discount_percent: 10.0,
    selected: false,
  },
  {
    id: "extended_warranty",
    title: "Extended Warranty Package",
    description: "Purchase 5-year extended warranty coverage",
    discount_percent: 3.5,
    selected: false,
  },
  {
    id: "training_program",
    title: "Staff Training Program",
    description: "Enroll staff in A-SAFE safety training certification",
    discount_percent: 4.0,
    selected: false,
  },
  {
    id: "case_study_participation",
    title: "Case Study Participation",
    description: "Allow A-SAFE to document and publish installation case study",
    discount_percent: 6.0,
    selected: false,
  },
];