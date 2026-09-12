/**
 * client/src/components/layout-editor/catalog.ts
 *
 * Catalogue and vehicle-type data for the editor: one `useQuery` each
 * (shared cache keys with the rest of the app), plus the pure mappers
 * that turn catalogue rows into what the ProductPicker, the quantity
 * take-off and the PAS 13 guardrails need.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FAMILIES, FAMILY_IDS, familyForProduct, type FamilyId } from "@shared/layout/symbols";
import type { CatalogProductLike } from "@shared/layout/quantities";
import type { GuardrailCatalogProduct, GuardrailVehicleType } from "./guardrails";

/** Shape of a row from GET /api/products?grouped=false. Only the fields we read. */
export interface CatalogProduct extends CatalogProductLike {
  id: string;
  name: string;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  specifications?: unknown;
  impactRating?: number | null;
  pas13TestJoules?: number | null;
  deflectionZone?: number | null;
  pricingLogic?: string | null;
  basePricePerMeter?: string | number | null;
  price?: string | number | null;
  suitabilityData?: { family?: unknown; [key: string]: unknown } | null;
  groundWorksData?: unknown;
}

export interface VehicleTypeRow extends GuardrailVehicleType {
  id: string;
  name: string;
  category?: string | null;
}

export const CATALOG_QUERY_KEY = ["/api/products", "layout-editor"] as const;

export function useCatalog(enabled = true) {
  const q = useQuery<CatalogProduct[]>({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/products?grouped=false&pageSize=200", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
      const data = await res.json();
      return Array.isArray(data) ? (data as CatalogProduct[]) : [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });
  return { products: q.data ?? [], isLoading: q.isLoading, error: q.error };
}

export function useVehicleTypes(enabled = true) {
  const q = useQuery<VehicleTypeRow[]>({
    queryKey: ["/api/vehicle-types"],
    enabled,
    staleTime: 5 * 60_000,
  });
  return { vehicleTypes: q.data ?? [], isLoading: q.isLoading };
}

/** Products grouped by family, in FAMILY_IDS order; empty families are omitted. */
export function groupProductsByFamily(products: readonly CatalogProduct[]): Map<FamilyId, CatalogProduct[]> {
  const out = new Map<FamilyId, CatalogProduct[]>();
  for (const p of products) {
    const fid = familyForProduct(p);
    const list = out.get(fid) ?? [];
    list.push(p);
    out.set(fid, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const ordered = new Map<FamilyId, CatalogProduct[]>();
  for (const id of FAMILY_IDS) {
    const list = out.get(id);
    if (list) ordered.set(id, list);
  }
  return ordered;
}

export function useProductsByFamily(products: readonly CatalogProduct[]) {
  return useMemo(() => groupProductsByFamily(products), [products]);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Guardrail lookup keyed by product id. */
export function guardrailProductsFromCatalog(products: readonly CatalogProduct[]): Map<string, GuardrailCatalogProduct> {
  const out = new Map<string, GuardrailCatalogProduct>();
  for (const p of products) {
    const spec = p.specifications && typeof p.specifications === "object" ? (p.specifications as Record<string, unknown>) : null;
    const gw = p.groundWorksData && typeof p.groundWorksData === "object" ? (p.groundWorksData as Record<string, unknown>) : null;
    out.set(p.id, {
      id: p.id,
      name: p.name,
      impactRatingJoules: num(p.impactRating) ?? num(p.pas13TestJoules),
      deflectionZoneMm: num(p.deflectionZone),
      maxPostCentreMm: spec ? num(spec.maxPostCentreMm) : null,
      substrateNotes: gw && typeof gw.substrateNotes === "string" ? gw.substrateNotes : null,
    });
  }
  return out;
}

/** Family label for a family id, tolerant of stale ids. */
export function familyLabel(familyId: string): string {
  return (FAMILIES as Record<string, { label: string } | undefined>)[familyId]?.label ?? familyId;
}
