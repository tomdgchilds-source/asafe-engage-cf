import { describe, it, expect } from "vitest";
import { quoteLineToCartItem } from "./quote";

const base = {
  productId: "p1",
  productName: "iFlex Double Traffic Barrier",
  sku: "IDT-1",
};

describe("quoteLineToCartItem", () => {
  it("maps a per-length line so quantity = metres and pricingType = per-meter", () => {
    const item = quoteLineToCartItem(
      {
        ...base,
        pricingMode: "per_length",
        quantityOrLengthMeters: 12.5,
        unitPriceAed: 400,
        extendedAed: 999999, // client-side extended value is ignored
      },
      { product: { impactRating: 17000, category: "traffic-barriers" }, zoneName: "Dock A" },
    );
    expect(item).toMatchObject({
      productName: base.productName,
      productId: "p1",
      sku: "IDT-1",
      quantity: 12.5,
      pricingType: "per-meter",
      unitPrice: 400,
      totalPrice: 5000,
      impactRating: 17000,
      category: "traffic-barriers",
      requiresInstallation: true,
      requiresDelivery: true,
      zoneName: "Dock A",
      areaName: "Dock A",
    });
    expect(item).not.toHaveProperty("lengthMeters");
  });

  it("maps a per-unit line with quantity = units and pricingType = per-unit", () => {
    const item = quoteLineToCartItem(
      { ...base, pricingMode: "per_unit", quantityOrLengthMeters: 3, unitPriceAed: 1234.567, extendedAed: 0 },
      { product: null, zoneName: null },
    );
    expect(item).toMatchObject({
      quantity: 3,
      pricingType: "per-unit",
      unitPrice: 1234.57,
      totalPrice: 3703.71,
      impactRating: null,
      category: "safety-barriers",
      zoneName: null,
      areaName: null,
    });
  });

  it("drops price-missing lines and lines with no usable quantity", () => {
    expect(
      quoteLineToCartItem(
        { ...base, pricingMode: "per_unit", quantityOrLengthMeters: 1, unitPriceAed: 0, extendedAed: 0, priceMissing: true },
        {},
      ),
    ).toBeNull();
    expect(
      quoteLineToCartItem(
        { ...base, pricingMode: "per_length", quantityOrLengthMeters: 0, unitPriceAed: 100, extendedAed: 0 },
        {},
      ),
    ).toBeNull();
  });
});
