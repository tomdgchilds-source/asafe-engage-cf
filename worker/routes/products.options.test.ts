import { describe, it, expect } from "vitest";
import {
  IFLEX_190_BOLLARD_FAMILY,
  deriveColour,
  deriveHeightMm,
  deriveFamilyOptions,
  findProductSubSize,
  formatHeightMm,
  parseHeightMetresFromName,
  productSubSizes,
  resolveBollardGroupKey,
} from "./products.options";
import { groupCatalogueProducts } from "./products";

// Rows as GET /api/products?grouped=false returns them (trimmed to the
// fields the grouping reads). Values mirror the production catalogue.
const row = (over: Record<string, unknown>) => ({
  category: "bollards",
  impactRating: null,
  pas13Compliant: false,
  pas13TestJoules: null,
  imageUrl: null,
  lifestyleImageUrl: null,
  description: null,
  technicalSheetUrl: null,
  installationGuideUrl: null,
  sku: null,
  priceListSource: null,
  specifications: null,
  variants: [],
  priceVariants: [],
  ...over,
});

const iflex2m = row({
  id: "family-iflex-190-bollard---2m",
  productId: "p-2m",
  name: "iFlex 190 Bollard - 2m",
  price: "2507.28",
  sku: "A-01-10-0050",
  priceListSource: "PRL-1019-ASF-AED-07112025-1",
  heightMin: 835,
  heightMax: 2000,
  impactRating: 5800,
  pas13Compliant: true,
  pas13TestJoules: 5800,
});
const bollardGrey = row({
  id: "family-bollard,-grey",
  productId: "p-grey",
  name: "Bollard, Grey",
  price: "1857.65",
  heightMin: 1200,
  heightMax: 1200,
  specifications: {
    variants: [
      { code: "S-01-07-0078", name: "190 OD x 1200 mm", od_mm: 190, price: 1857.65, height_mm: 1200, length_mm: null },
      { code: "S-01-07-0090", name: "210 OD x 1200 mm", od_mm: 210, price: 2338.44, height_mm: 1200, length_mm: null },
    ],
  },
});
const bollardYellow = row({
  id: "family-bollard,-yellow",
  productId: "p-yellow",
  name: "Bollard, Yellow",
  price: "1557.50",
  heightMin: 835,
  heightMax: 1200,
  specifications: {
    variants: [
      { code: "S-01-07-0057", name: "190 OD x 835 mm", od_mm: 190, price: 1557.5, height_mm: 835, length_mm: null },
      { code: "S-01-07-0053", name: "190 OD x 1200 mm", od_mm: 190, price: 1865.14, height_mm: 1200, length_mm: null },
      { code: "S-01-07-0065", name: "210 OD x 1200 mm", od_mm: 210, price: 2348.11, height_mm: 1200, length_mm: null },
    ],
  },
});
const heavyParent = row({
  id: "family-iflex-heavy-duty-bollard",
  productId: "p-hd",
  name: "iFlex Heavy Duty Bollard",
  price: null,
  heightMin: 1200,
  heightMax: 2000,
  impactRating: 5700,
  pas13Compliant: true,
  pas13TestJoules: 5700,
});
const heavyYellow = row({
  id: "family-heavy-duty-bollard,-yellow,-galv",
  productId: "p-hd-y",
  name: "Heavy Duty Bollard, Yellow, GALV",
  price: "3056.98",
  heightMin: 1200,
  heightMax: 1200,
  specifications: { variants: [{ code: "S-01-07-0073", name: "210 OD x 1200 mm", od_mm: 210, price: 3056.98, height_mm: 1200, length_mm: null }] },
});
const heavyGrey = row({
  id: "family-heavy-duty-bollard,-grey,-galv",
  productId: "p-hd-g",
  name: "Heavy Duty Bollard, Grey, GALV",
  price: "3163.68",
  heightMin: 1200,
  heightMax: 1200,
  specifications: { variants: [{ code: "S-01-07-0103", name: "210 OD x 1200 mm", od_mm: 210, price: 3163.68, height_mm: 1200, length_mm: null }] },
});
const swingSelfClose = row({
  id: "family-hydraulic-swing-gate-(2r)---self-close",
  productId: "p-sg-sc",
  name: "Hydraulic Swing Gate (2R) - Self-Close",
  category: "gates",
  price: "1975.98",
  sku: "S-01-09-0302",
  heightMin: null,
  heightMax: null,
});
const swingPost = row({
  id: "family-hydraulic-swing-gate-(2r)---post",
  productId: "p-sg-p",
  name: "Hydraulic Swing Gate (2R) - Post",
  category: "gates",
  price: "1269.54",
  sku: "A-01-12-0166",
  heightMin: null,
  heightMax: null,
});

describe("height and colour derivation", () => {
  it("reads a metres token from the name and ignores millimetre tokens", () => {
    expect(parseHeightMetresFromName("iFlex 190 Bollard - 2m")).toBe(2000);
    expect(parseHeightMetresFromName("Sign Post, 1.2m - Yellow")).toBe(1200);
    expect(parseHeightMetresFromName("iFlex 190 Bollard - 1.2 m")).toBe(1200);
    expect(parseHeightMetresFromName("Topple Barrier 2.08m with ForkGuard")).toBe(2080);
    expect(parseHeightMetresFromName("230 x 230mm - 190mm OD iFlex Post Slider Plate")).toBeNull();
    expect(parseHeightMetresFromName("Bollard, Yellow")).toBeNull();
    expect(parseHeightMetresFromName("Monoplex 190 Bollard")).toBeNull();
  });

  it("prefers the name token, then heightMax, never heightMin", () => {
    // 2 m row: heightMin 835 / heightMax 2000, name says 2m.
    expect(deriveHeightMm(iflex2m as any)).toBe(2000);
    // "Bollard, Yellow": heightMin 835 / heightMax 1200, no token.
    expect(deriveHeightMm(bollardYellow as any)).toBe(1200);
    expect(deriveHeightMm({ name: "Bollard, Grey", heightMin: 1200, heightMax: 1200 })).toBe(1200);
    // The name wins over a disagreeing column.
    expect(deriveHeightMm({ name: "Topple Barrier 2.08m with ForkGuard", heightMin: 3600, heightMax: 5300 })).toBe(2080);
    // heightMin alone is not a height for this SKU.
    expect(deriveHeightMm({ name: "Some Post", heightMin: 835, heightMax: null })).toBeNull();
    expect(deriveHeightMm({ name: "Some Post" })).toBeNull();
  });

  it("parses Yellow / Grey / Black from the name", () => {
    expect(deriveColour("Bollard, Yellow")).toBe("Yellow");
    expect(deriveColour("Heavy Duty Bollard, Grey, GALV")).toBe("Grey");
    expect(deriveColour("Corner Guard - gray")).toBe("Grey");
    expect(deriveColour("Post Cap BLACK")).toBe("Black");
    expect(deriveColour("iFlex 190 Bollard - 2m")).toBeNull();
    expect(deriveColour("Tape Barrier Kit - Wall to Wall - YEL/BLK")).toBeNull();
  });

  it("formats heights for the picker", () => {
    expect(formatHeightMm(1200)).toBe("1.2 m");
    expect(formatHeightMm(2000)).toBe("2 m");
    expect(formatHeightMm(2080)).toBe("2.08 m");
    expect(formatHeightMm(835)).toBe("835 mm");
  });
});

// The six options the iFlex 190 Bollard card must offer, in order.
const IFLEX_190_OPTIONS = [
  { optionLabel: "835 mm · Yellow", priceAed: 1557.5, sku: "S-01-07-0057", heightMm: 835, odMm: 190, colour: "Yellow", parentName: "Bollard, Yellow" },
  { optionLabel: "1.2 m · Yellow", priceAed: 1865.14, sku: "S-01-07-0053", heightMm: 1200, odMm: 190, colour: "Yellow", parentName: "Bollard, Yellow" },
  { optionLabel: "1.2 m · Grey", priceAed: 1857.65, sku: "S-01-07-0078", heightMm: 1200, odMm: 190, colour: "Grey", parentName: "Bollard, Grey" },
  { optionLabel: "1.2 m · 210 OD · Yellow", priceAed: 2348.11, sku: "S-01-07-0065", heightMm: 1200, odMm: 210, colour: "Yellow", parentName: "Bollard, Yellow" },
  { optionLabel: "1.2 m · 210 OD · Grey", priceAed: 2338.44, sku: "S-01-07-0090", heightMm: 1200, odMm: 210, colour: "Grey", parentName: "Bollard, Grey" },
  { optionLabel: "2 m", priceAed: 2507.28, sku: "A-01-10-0050", heightMm: 2000, odMm: null, colour: null, parentName: "iFlex 190 Bollard - 2m" },
];
const pick = (o: any) => ({
  optionLabel: o.optionLabel,
  priceAed: o.priceAed,
  sku: o.sku,
  heightMm: o.heightMm,
  odMm: o.odMm,
  colour: o.colour,
  parentName: o.parentName,
});

describe("productSubSizes", () => {
  it("reads the priced, SKU'd sub-sizes of a row", () => {
    expect(productSubSizes(bollardYellow as any).map((s) => [s.sku, s.name, s.priceAed, s.heightMm, s.odMm])).toEqual([
      ["S-01-07-0057", "190 OD x 835 mm", 1557.5, 835, 190],
      ["S-01-07-0053", "190 OD x 1200 mm", 1865.14, 1200, 190],
      ["S-01-07-0065", "210 OD x 1200 mm", 2348.11, 1200, 210],
    ]);
    expect(productSubSizes(heavyYellow as any).map((s) => s.sku)).toEqual(["S-01-07-0073"]);
    expect(productSubSizes(iflex2m as any)).toEqual([]);
  });

  it("falls back to the sub-size name for height and OD, and accepts a JSON string", () => {
    const row = { name: "Post, Yellow", specifications: JSON.stringify({ variants: [{ code: "X-1", name: "210 OD x 1200 mm", price: "99.5" }] }) };
    expect(productSubSizes(row).map((s) => [s.sku, s.priceAed, s.heightMm, s.odMm])).toEqual([["X-1", 99.5, 1200, 210]]);
  });

  it("has none on a price-list row: its spec sub-sizes are stale", () => {
    const stale = { variants: [{ code: "A-01-12-0368", name: "2000 mm", price: 14999.59, height_mm: 2000 }] };
    expect(productSubSizes({ name: "Traffic Gate", specifications: stale, priceVariants: [{ sku: "A-01-12-0368", priceAed: "14804.10" }] })).toEqual([]);
    expect(productSubSizes({ name: "Car Stop", specifications: stale, priceListSource: "PRL-1019-ASF-AED-07112025-1" })).toEqual([]);
  });

  it("is all-or-nothing: a missing price, a missing or repeated SKU, or a run length disqualifies the row", () => {
    const ok = { code: "A", name: "190 OD x 1200 mm", price: 10 };
    const row = (variants: unknown[]) => ({ name: "Post", specifications: { variants } });
    expect(productSubSizes(row([ok, { code: "B", name: "x", price: 0 }]))).toEqual([]);
    expect(productSubSizes(row([ok, { name: "no sku", price: 5 }]))).toEqual([]);
    expect(productSubSizes(row([ok, { ...ok }]))).toEqual([]);
    expect(productSubSizes(row([ok, { code: "C", name: "900 mm", price: 5, length_mm: 900 }]))).toEqual([]);
    expect(productSubSizes(row([]))).toEqual([]);
    expect(productSubSizes(null)).toEqual([]);
  });

  it("finds one sub-size by SKU", () => {
    expect(findProductSubSize(bollardYellow as any, "S-01-07-0053")?.priceAed).toBe(1865.14);
    expect(findProductSubSize(bollardYellow as any, " S-01-07-0053 ")?.priceAed).toBe(1865.14);
    // Grey's SKU is not a size of the Yellow row.
    expect(findProductSubSize(bollardYellow as any, "S-01-07-0078")).toBeNull();
    expect(findProductSubSize(bollardYellow as any, "")).toBeNull();
    expect(findProductSubSize(bollardYellow as any, null)).toBeNull();
  });
});

describe("deriveFamilyOptions", () => {
  it("expands the three iFlex 190 rows into the six priced options, by height, OD, colour", () => {
    const options = deriveFamilyOptions([iflex2m, bollardGrey, bollardYellow] as any[]);
    expect(options.map(pick)).toEqual(IFLEX_190_OPTIONS);
    // Each sub-size option points back at its row and carries the stored sub-size.
    expect(options[1]).toMatchObject({
      id: "family-bollard,-yellow::S-01-07-0053",
      parentId: "family-bollard,-yellow",
      parentProductId: "p-yellow",
      subVariant: { code: "S-01-07-0053", name: "190 OD x 1200 mm", price: 1865.14 },
    });
    // The 2 m row has no sub-sizes: it is one option, the whole row.
    expect(options[5]).toMatchObject({ id: "family-iflex-190-bollard---2m", parentProductId: "p-2m", subVariant: null });
  });

  it("gives the same six whatever order the rows arrive in", () => {
    expect(deriveFamilyOptions([bollardYellow, iflex2m, bollardGrey] as any[]).map(pick)).toEqual(IFLEX_190_OPTIONS);
  });

  it("prices the heavy-duty rows from their sub-size and leaves the OD out when every option shares it", () => {
    expect(deriveFamilyOptions([heavyGrey, heavyYellow] as any[]).map(pick)).toEqual([
      { optionLabel: "1.2 m · Yellow", priceAed: 3056.98, sku: "S-01-07-0073", heightMm: 1200, odMm: 210, colour: "Yellow", parentName: "Heavy Duty Bollard, Yellow, GALV" },
      { optionLabel: "1.2 m · Grey", priceAed: 3163.68, sku: "S-01-07-0103", heightMm: 1200, odMm: 210, colour: "Grey", parentName: "Heavy Duty Bollard, Grey, GALV" },
    ]);
  });

  it("falls back to the row name when there is no height, OD or colour", () => {
    expect(deriveFamilyOptions([swingSelfClose, swingPost] as any[]).map((o) => [o.optionLabel, o.priceAed, o.heightMm, o.colour, o.subVariant])).toEqual([
      ["Hydraulic Swing Gate (2R) - Post", 1269.54, null, null, null],
      ["Hydraulic Swing Gate (2R) - Self-Close", 1975.98, null, null, null],
    ]);
  });

  it("tells duplicate labels apart by SKU, then by name", () => {
    const withSku = deriveFamilyOptions([
      { id: "a", name: "Bollard, Yellow", sku: "S-01", price: "10", heightMax: 1200 },
      { id: "b", name: "Bollard, Yellow", sku: "S-02", price: "20", heightMax: 1200 },
      { id: "c", name: "Bollard, Grey", sku: "S-03", price: "30", heightMax: 1200 },
    ]);
    expect(withSku.map((o) => o.optionLabel)).toEqual(["1.2 m · Yellow · S-01", "1.2 m · Yellow · S-02", "1.2 m · Grey"]);

    const byName = deriveFamilyOptions([
      { id: "a", name: "Bollard A, Yellow", price: "10", heightMax: 1200 },
      { id: "b", name: "Bollard B, Yellow", price: "20", heightMax: 1200 },
    ]);
    expect(byName.map((o) => o.optionLabel)).toEqual(["1.2 m · Yellow · Bollard A, Yellow", "1.2 m · Yellow · Bollard B, Yellow"]);
  });

  it("numbers labels that are still identical so the picker never repeats a row", () => {
    const sameName = deriveFamilyOptions([{ name: "Sign Cap" }, { name: "Sign Cap" }]);
    expect(sameName.map((o) => o.optionLabel)).toEqual(["Sign Cap (1)", "Sign Cap (2)"]);
  });

  it("does not expand a price-list row even when stale spec sub-sizes sit on it", () => {
    const options = deriveFamilyOptions([
      { id: "tg", name: "Traffic Gate", price: "14804.10", sku: "A-01-12-0368", priceListSource: "PRL-1", specifications: { variants: [{ code: "A-01-12-0368", name: "2000 mm", price: 14999.59 }, { code: "A-01-12-0369", name: "2500 mm", price: 17067.71 }] } },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ priceAed: 14804.1, subVariant: null });
  });
});

describe("resolveBollardGroupKey", () => {
  it("puts the 1.2 m and 2 m iFlex 190 rows on one card", () => {
    expect(IFLEX_190_BOLLARD_FAMILY).toBe("iFlex 190 Bollard");
    expect(resolveBollardGroupKey("Bollard, Yellow")).toBe("iFlex 190 Bollard");
    expect(resolveBollardGroupKey("Bollard, Grey")).toBe("iFlex 190 Bollard");
    expect(resolveBollardGroupKey("iFlex 190 Bollard - 2m")).toBe("iFlex 190 Bollard");
  });

  it("keeps the other bollard lines on their own cards", () => {
    expect(resolveBollardGroupKey("Cold Storage iFlex 190 Bollard")).toBe("Cold Storage iFlex 190 Bollard");
    expect(resolveBollardGroupKey("iFlex Heavy Duty Bollard")).toBe("iFlex Heavy Duty Bollard");
    expect(resolveBollardGroupKey("Heavy Duty Bollard, Yellow, GALV")).toBe("iFlex Heavy Duty Bollard");
    expect(resolveBollardGroupKey("Monoplex 190 Bollard")).toBe("Monoplex 190 Bollard");
    expect(resolveBollardGroupKey("Monoplex 130 Bollard")).toBe("Monoplex 130 Bollard");
    expect(resolveBollardGroupKey("iFlex Post 130")).toBe("iFlex Post 130");
    expect(resolveBollardGroupKey("Sign Post, 1.2m - Yellow")).toBe("Sign Post, 1.2m - Yellow");
    expect(resolveBollardGroupKey("Some Other Bollard")).toBeNull();
  });
});

describe("groupCatalogueProducts", () => {
  // Same order the route produces: impact rating descending, unrated last.
  const sorted = () => [iflex2m, heavyParent, bollardGrey, heavyYellow, heavyGrey, swingSelfClose, swingPost, bollardYellow];

  it("returns ONE iFlex 190 Bollard card: three rows, six exact options", () => {
    const groups = groupCatalogueProducts(sorted());
    const cards = groups.filter((g) => /iFlex (190 )?Bollard$/.test(g.name));
    expect(cards.map((g) => g.name)).toEqual(["iFlex 190 Bollard"]);

    const card = cards[0];
    expect(card.hasVariants).toBe(true);
    // The rows keep their stored names: they are the cart / pricing key.
    expect(card.productVariants.map((v: any) => [v.name, v.price])).toEqual([
      ["iFlex 190 Bollard - 2m", "2507.28"],
      ["Bollard, Grey", "1857.65"],
      ["Bollard, Yellow", "1557.50"],
    ]);
    expect(card.options.map(pick)).toEqual(IFLEX_190_OPTIONS);
    // Every option's parent is one of the card's rows.
    const rowIds = new Set(card.productVariants.map((v: any) => v.id));
    expect(card.options.every((o: any) => rowIds.has(o.parentId))).toBe(true);
  });

  it("spans the card's price band and heights across the expanded options", () => {
    const card = groupCatalogueProducts(sorted()).find((g) => g.name === "iFlex 190 Bollard");
    expect(card.minPrice).toBe(1557.5);
    expect(card.maxPrice).toBe(2507.28);
    expect(card.heightMin).toBe(835);
    expect(card.heightMax).toBe(2000);
  });

  it("gives the heavy-duty card its two priced colours and keeps the priceless parent out", () => {
    const card = groupCatalogueProducts(sorted()).find((g) => g.name === "iFlex Heavy Duty Bollard");
    expect(card.options.map((o: any) => [o.optionLabel, o.priceAed, o.sku, o.parentName])).toEqual([
      ["1.2 m · Yellow", 3056.98, "S-01-07-0073", "Heavy Duty Bollard, Yellow, GALV"],
      ["1.2 m · Grey", 3163.68, "S-01-07-0103", "Heavy Duty Bollard, Grey, GALV"],
    ]);
    expect(card.minPrice).toBe(3056.98);
    expect(card.maxPrice).toBe(3163.68);
    expect(card.heightMin).toBe(1200);
    expect(card.heightMax).toBe(1200);
    expect(card.impactRating).toBe(5700);
  });

  it("lists name-only options on a family with no height or colour and leaves its heights alone", () => {
    const card = groupCatalogueProducts(sorted()).find((g) => g.name === "Hydraulic Swing Gate");
    expect(card.options.map((o: any) => [o.optionLabel, o.heightMm, o.colour, o.subVariant])).toEqual([
      ["Hydraulic Swing Gate (2R) - Post", null, null, null],
      ["Hydraulic Swing Gate (2R) - Self-Close", null, null, null],
    ]);
    expect(card.heightMin).toBeNull();
    expect(card.heightMax).toBeNull();
  });

  it("keeps a single-option card's own height range", () => {
    const barrier = row({ id: "family-x", productId: "p-x", name: "iFlex Single Traffic", category: "traffic-guardrails", price: "2817.48", heightMin: 205, heightMax: 395 });
    const [card] = groupCatalogueProducts([barrier]);
    expect(card.options).toHaveLength(1);
    expect(card.heightMin).toBe(205);
    expect(card.heightMax).toBe(395);
  });

  it("still expands a card that a search left with one row", () => {
    const [card] = groupCatalogueProducts([bollardYellow]);
    expect(card.name).toBe("iFlex 190 Bollard");
    expect(card.options.map((o: any) => o.optionLabel)).toEqual(["835 mm · Yellow", "1.2 m · Yellow", "1.2 m · 210 OD · Yellow"]);
    expect(card.heightMin).toBe(835);
    expect(card.heightMax).toBe(1200);
  });

  it("does not mutate the rows it was given", () => {
    const input = sorted();
    groupCatalogueProducts(input);
    expect(input.every((p) => !("options" in p) && !("optionLabel" in p))).toBe(true);
    expect(bollardYellow.name).toBe("Bollard, Yellow");
  });
});
