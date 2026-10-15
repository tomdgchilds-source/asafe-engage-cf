import { describe, it, expect } from "vitest";
import {
  POST_PITCH_METRES,
  postCountForMetres,
  defaultAccessoryQuantity,
  normaliseAccessoryLine,
  normaliseAccessoryLines,
  accessoryLineTotalAed,
  accessoryLinesTotalAed,
  hasPriceToConfirm,
  accessoryLineId,
  parseAccessoryLineId,
} from "./accessories";
import { ACCESSORY_CATALOGUE, ACCESSORY_GROUPS, ACCESSORY_UNITS, accessoryCatalogueEntry } from "../cartAccessories";
import { MIGRATIONS } from "../../migrations/index";

const run24 = { id: "r", unitPrice: 410, quantity: 24, pricingType: "linear_meter", requiresDelivery: true, requiresInstallation: true };
const bollards6 = { id: "b", unitPrice: 320, quantity: 6, pricingType: "per_item" };

describe("postCountForMetres", () => {
  it("is ceil(L / 2.2) + 1 and 0 for no length", () => {
    expect(POST_PITCH_METRES).toBe(2.2);
    expect(postCountForMetres(24)).toBe(12); // ceil(10.9) + 1
    expect(postCountForMetres(2.2)).toBe(2);
    expect(postCountForMetres(2.3)).toBe(3);
    expect(postCountForMetres(0)).toBe(0);
    expect(postCountForMetres(-3)).toBe(0);
    expect(postCountForMetres(NaN)).toBe(0);
  });
});

describe("defaultAccessoryQuantity", () => {
  it("per_post on a per-metre run is the post count; on a per-unit line it is the unit count", () => {
    expect(defaultAccessoryQuantity("per_post", run24)).toBe(12);
    expect(defaultAccessoryQuantity("per_post", bollards6)).toBe(6);
    // lengthMeters wins over quantity for a run (shared/layout stores both).
    expect(defaultAccessoryQuantity("per_post", { ...run24, quantity: 1, lengthMeters: 11 })).toBe(6);
  });

  it("per_metre is the run metres, each / per_pair follow the unit count or 1 for a run", () => {
    expect(defaultAccessoryQuantity("per_metre", run24)).toBe(24);
    expect(defaultAccessoryQuantity("per_metre", bollards6)).toBe(6);
    expect(defaultAccessoryQuantity("each", run24)).toBe(1);
    expect(defaultAccessoryQuantity("each", bollards6)).toBe(6);
    expect(defaultAccessoryQuantity("per_pair", run24)).toBe(1);
  });

  it("never returns less than 1", () => {
    expect(defaultAccessoryQuantity("per_post", { quantity: 0, pricingType: "per_item" })).toBe(1);
    expect(defaultAccessoryQuantity("each", null)).toBe(1);
    expect(defaultAccessoryQuantity("per_metre", { quantity: "junk" })).toBe(1);
  });
});

describe("normaliseAccessoryLine(s)", () => {
  it("fills a missing quantity from the unit default and stores it on the line", () => {
    const l = normaliseAccessoryLine({ code: "fixing-stainless-steel", label: "SS fixings", unit: "per_post", unitPriceAed: null }, run24);
    expect(l).toEqual({
      code: "fixing-stainless-steel",
      label: "SS fixings",
      unit: "per_post",
      quantity: 12,
      unitPriceAed: null,
      priceToConfirm: true,
    });
  });

  it("keeps an explicit quantity, rounds the price, and respects an admin 'to confirm' flag on a priced row", () => {
    const l = normaliseAccessoryLine({ code: "dock-buffer-pair", unit: "per_pair", quantity: "3", unitPriceAed: "2287.0849", priceToConfirm: false }, bollards6);
    expect(l?.quantity).toBe(3);
    expect(l?.unitPriceAed).toBe(2287.08);
    expect(l?.priceToConfirm).toBe(false);
    expect(l?.label).toBe("dock-buffer-pair");
    const flagged = normaliseAccessoryLine({ code: "x", unitPriceAed: 10, priceToConfirm: true }, null);
    expect(flagged?.priceToConfirm).toBe(true);
    expect(flagged?.unit).toBe("each");
  });

  it("drops entries without a code and tolerates JSON strings, junk and null", () => {
    expect(normaliseAccessoryLine(null, run24)).toBeNull();
    expect(normaliseAccessoryLine({ label: "no code" }, run24)).toBeNull();
    expect(normaliseAccessoryLine({ code: "   " }, run24)).toBeNull();
    expect(normaliseAccessoryLines(null, run24)).toEqual([]);
    expect(normaliseAccessoryLines("not json", run24)).toEqual([]);
    expect(normaliseAccessoryLines({ code: "obj-not-array" }, run24)).toEqual([]);
    const fromString = normaliseAccessoryLines(JSON.stringify([{ code: "l-bracket", unit: "each", quantity: 4, unitPriceAed: 25 }, {}]), bollards6);
    expect(fromString).toHaveLength(1);
    expect(fromString[0].quantity).toBe(4);
    expect(fromString[0].unitPriceAed).toBe(25);
    expect(fromString[0].priceToConfirm).toBe(false);
  });

  it("treats a negative or non-numeric price as unpriced", () => {
    expect(normaliseAccessoryLine({ code: "a", unitPriceAed: -5 }, null)?.unitPriceAed).toBeNull();
    expect(normaliseAccessoryLine({ code: "a", unitPriceAed: "abc" }, null)?.unitPriceAed).toBe(0);
    expect(normaliseAccessoryLine({ code: "a", unitPriceAed: { nested: 1 } }, null)?.unitPriceAed).toBeNull();
  });
});

describe("accessory totals", () => {
  it("prices quantity × unit at 2 dp and 0 for an unpriced line", () => {
    expect(accessoryLineTotalAed({ quantity: 12, unitPriceAed: 513 })).toBe(6156);
    expect(accessoryLineTotalAed({ quantity: 3, unitPriceAed: 612.96 })).toBe(1838.88);
    expect(accessoryLineTotalAed({ quantity: 12, unitPriceAed: null })).toBe(0);
    expect(accessoryLineTotalAed({ quantity: 0, unitPriceAed: 513 })).toBe(0);
  });

  it("sums priced lines, skips unpriced ones, and reports price-to-confirm", () => {
    const lines = [
      { code: "slider-plate-iflex-190", label: "", unit: "per_post" as const, quantity: 12, unitPriceAed: 513, priceToConfirm: false },
      { code: "fixing-stainless-steel", label: "", unit: "per_post" as const, quantity: 12, unitPriceAed: null, priceToConfirm: true },
      { code: "dock-buffer-pair", label: "", unit: "per_pair" as const, quantity: 1, unitPriceAed: 2287.08, priceToConfirm: false },
    ];
    expect(accessoryLinesTotalAed(lines)).toBe(8443.08);
    expect(hasPriceToConfirm(lines)).toBe(true);
    expect(hasPriceToConfirm(lines.filter((l) => !l.priceToConfirm))).toBe(false);
    expect(accessoryLinesTotalAed(null)).toBe(0);
    expect(hasPriceToConfirm(undefined)).toBe(false);
  });
});

describe("accessory line ids", () => {
  it("round-trips <itemId>:acc:<code> and rejects parent ids", () => {
    const id = accessoryLineId("abc-123", "fixing-stainless-steel");
    expect(id).toBe("abc-123:acc:fixing-stainless-steel");
    expect(parseAccessoryLineId(id)).toEqual({ parentId: "abc-123", code: "fixing-stainless-steel" });
    expect(parseAccessoryLineId("abc-123")).toBeNull();
    expect(parseAccessoryLineId(":acc:x")).toBeNull();
  });
});

describe("ACCESSORY_CATALOGUE", () => {
  it("has unique codes, valid groups and units, and prices only where a SKU exists", () => {
    const codes = ACCESSORY_CATALOGUE.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const a of ACCESSORY_CATALOGUE) {
      expect(ACCESSORY_GROUPS).toContain(a.group);
      expect(ACCESSORY_UNITS).toContain(a.unit);
      expect(a.active).toBe(true);
      if (a.priceAed === null) {
        expect(a.priceToConfirm).toBe(true);
        expect(a.sku).toBeNull();
      } else {
        expect(a.priceToConfirm).toBe(false);
        expect(a.sku).toMatch(/^[A-Z]-\d{2}-\d{2}-\d{4}$/);
      }
    }
    expect(accessoryCatalogueEntry("slider-plate-iflex-190")?.priceAed).toBe(513);
    expect(accessoryCatalogueEntry("dock-buffer-pair")?.priceAed).toBe(2287.08);
    expect(accessoryCatalogueEntry("spacer-flexishield-300-yellow")?.priceAed).toBe(959.52);
    expect(accessoryCatalogueEntry("fixing-stainless-steel")?.priceAed).toBeNull();
    expect(accessoryCatalogueEntry("nope")).toBeUndefined();
  });

  it("is fully seeded by migration 2026-10-15-009 with matching prices", () => {
    const m = MIGRATIONS.find((x) => x.id === "2026-10-15-009-accessory-prices-and-custom-items");
    expect(m).toBeDefined();
    expect(m!.appliedHistorically).toBe(false);
    for (const a of ACCESSORY_CATALOGUE) {
      const row = new RegExp(`\\('${a.code}',\\s*'[^']*',\\s*'${a.group}',\\s*'${a.unit}',\\s*(${a.priceAed === null ? "NULL" : a.priceAed.toFixed(2)}),\\s*(${a.priceToConfirm})`);
      expect(m!.sql, `seed row for ${a.code}`).toMatch(row);
    }
  });
});
