import { describe, it, expect } from "vitest";
import { deriveFamilyOptions } from "@shared/productOptions";
import { getHeightVariants, getProductOptions } from "./productOptions";

// The three rows of the merged card as the grouped API returns them
// (trimmed), in the server's order: impact rating descending.
const sub = (code: string, name: string, od_mm: number, height_mm: number, price: number) => ({ code, name, od_mm, price, height_mm, length_mm: null });
const rows = [
  { id: "family-iflex-190-bollard---2m", productId: "p-2m", name: "iFlex 190 Bollard - 2m", price: "2507.28", sku: "A-01-10-0050", priceListSource: "PRL-1", heightMin: 835, heightMax: 2000 },
  {
    id: "family-bollard,-grey",
    productId: "p-grey",
    name: "Bollard, Grey",
    price: "1857.65",
    heightMin: 1200,
    heightMax: 1200,
    specifications: { variants: [sub("S-01-07-0078", "190 OD x 1200 mm", 190, 1200, 1857.65), sub("S-01-07-0090", "210 OD x 1200 mm", 210, 1200, 2338.44)] },
  },
  {
    id: "family-bollard,-yellow",
    productId: "p-yellow",
    name: "Bollard, Yellow",
    price: "1557.50",
    heightMin: 835,
    heightMax: 1200,
    specifications: {
      variants: [sub("S-01-07-0057", "190 OD x 835 mm", 190, 835, 1557.5), sub("S-01-07-0053", "190 OD x 1200 mm", 190, 1200, 1865.14), sub("S-01-07-0065", "210 OD x 1200 mm", 210, 1200, 2348.11)],
    },
  },
];
// Exactly what the server puts on the card.
const serverOptions = deriveFamilyOptions(rows);

const heavyRows = [
  { id: "hd-y", name: "Heavy Duty Bollard, Yellow, GALV", price: "3056.98", heightMin: 1200, heightMax: 1200, specifications: { variants: [sub("S-01-07-0073", "210 OD x 1200 mm", 210, 1200, 3056.98)] } },
  { id: "hd-g", name: "Heavy Duty Bollard, Grey, GALV", price: "3163.68", heightMin: 1200, heightMax: 1200, specifications: { variants: [sub("S-01-07-0103", "210 OD x 1200 mm", 210, 1200, 3163.68)] } },
];

describe("getProductOptions with server options", () => {
  it("offers the six iFlex 190 Bollard options with exact prices, in server order", () => {
    const set = getProductOptions(rows, serverOptions)!;
    expect(set.options.map((o) => [o.label, o.price, o.subVariantSku, o.product.name])).toEqual([
      ["835 mm · Yellow", 1557.5, "S-01-07-0057", "Bollard, Yellow"],
      ["1.2 m · Yellow", 1865.14, "S-01-07-0053", "Bollard, Yellow"],
      ["1.2 m · Grey", 1857.65, "S-01-07-0078", "Bollard, Grey"],
      ["1.2 m · 210 OD · Yellow", 2348.11, "S-01-07-0065", "Bollard, Yellow"],
      ["1.2 m · 210 OD · Grey", 2338.44, "S-01-07-0090", "Bollard, Grey"],
      // The 2 m row is one option: the whole row, no sub-size to preselect.
      ["2 m", 2507.28, null, "iFlex 190 Bollard - 2m"],
    ]);
    // No "from" price anywhere: every option has one exact price.
    expect(set.options.some((o) => o.priceIsFrom)).toBe(false);
    expect(set.axisLabel).toBe("Size / colour");
    expect(set.heightOnly).toBe(false);
  });

  it("defaults to the cheapest option and gives every option its own id", () => {
    const set = getProductOptions(rows, serverOptions)!;
    expect(set.defaultId).toBe("family-bollard,-yellow::S-01-07-0057");
    expect(new Set(set.options.map((o) => o.id)).size).toBe(6);
    expect(set.options[1].subVariant).toMatchObject({ code: "S-01-07-0053", name: "190 OD x 1200 mm" });
  });

  it("labels the heavy-duty card 'Colour' and prices it from the sub-sizes", () => {
    const set = getProductOptions(heavyRows, deriveFamilyOptions(heavyRows))!;
    expect(set.axisLabel).toBe("Colour");
    expect(set.options.map((o) => [o.label, o.price, o.subVariantSku])).toEqual([
      ["1.2 m · Yellow", 3056.98, "S-01-07-0073"],
      ["1.2 m · Grey", 3163.68, "S-01-07-0103"],
    ]);
    expect(set.defaultId).toBe("hd-y::S-01-07-0073");
  });

  it("works for a card a search left with a single row", () => {
    const yellow = [rows[2]];
    const set = getProductOptions(yellow, deriveFamilyOptions(yellow))!;
    expect(set.options.map((o) => o.label)).toEqual(["835 mm · Yellow", "1.2 m · Yellow", "1.2 m · 210 OD · Yellow"]);
    expect(set.axisLabel).toBe("Size");
  });

  it("keeps the generic presentation for families the server could only label by name", () => {
    const gates = [
      { id: "sc", name: "Hydraulic Swing Gate (2R) - Self-Close", price: "1975.98" },
      { id: "p", name: "Hydraulic Swing Gate (2R) - Post", price: "1269.54" },
    ];
    expect(getProductOptions(gates, deriveFamilyOptions(gates))).toBeNull();
  });

  it("ignores server options that do not point at the card's rows", () => {
    expect(getProductOptions([rows[0]], serverOptions)).toBeNull();
  });
});

describe("getProductOptions without server options", () => {
  it("still offers a height picker for a height-only family", () => {
    const local = [
      { id: "a", name: "iFlex 190 Bollard - 2m", price: 2507.28 },
      { id: "b", name: "iFlex 190 Bollard - 1.2m", price: 1900 },
    ];
    expect(getHeightVariants(local)).not.toBeNull();
    const set = getProductOptions(local)!;
    expect(set.axisLabel).toBe("Height");
    expect(set.heightOnly).toBe(true);
    expect(set.options.map((o) => [o.id, o.label, o.price, o.subVariantSku])).toEqual([
      ["b", "1.2 m", 1900, null],
      ["a", "2 m", 2507.28, null],
    ]);
    expect(set.defaultId).toBe("b");
  });

  it("returns null for client-built groups and for nothing at all", () => {
    expect(getProductOptions([{ id: "car", name: "Car Stop", price: "325.44" }, { id: "truck", name: "Truck Stop", price: "791.88" }])).toBeNull();
    expect(getProductOptions(undefined)).toBeNull();
    expect(getProductOptions([])).toBeNull();
    expect(getProductOptions([rows[0]])).toBeNull();
  });
});
