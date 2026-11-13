import { describe, it, expect } from "vitest";
import { productDisplayName } from "./productDisplayName";

// selectedVariant as AddToCartModal stores it for a sub-size line.
const sv = (parentName: string, name: string, heightMm: number, odMm: number, code: string) => ({
  code,
  sku: code,
  name,
  variant: name,
  height: heightMm,
  heightMm,
  odMm,
  price: 1,
  parentName,
});

describe("productDisplayName — sub-size lines", () => {
  it("names the iFlex 190 bollard sizes from the parent row + selected variant", () => {
    expect(productDisplayName("Bollard, Yellow", sv("Bollard, Yellow", "190 OD x 1200 mm", 1200, 190, "S-01-07-0053"))).toBe("iFlex 190 Bollard, 1.2 m, Yellow");
    expect(productDisplayName("Bollard, Yellow", sv("Bollard, Yellow", "190 OD x 835 mm", 835, 190, "S-01-07-0057"))).toBe("iFlex 190 Bollard, 835 mm, Yellow");
    expect(productDisplayName("Bollard, Grey", sv("Bollard, Grey", "190 OD x 1200 mm", 1200, 190, "S-01-07-0078"))).toBe("iFlex 190 Bollard, 1.2 m, Grey");
    expect(productDisplayName("Bollard, Grey", sv("Bollard, Grey", "210 OD x 1200 mm", 1200, 210, "S-01-07-0090"))).toBe("iFlex 190 Bollard, 1.2 m, 210 OD, Grey");
    expect(productDisplayName("Bollard, Yellow", sv("Bollard, Yellow", "210 OD x 1200 mm", 1200, 210, "S-01-07-0065"))).toBe("iFlex 190 Bollard, 1.2 m, 210 OD, Yellow");
  });

  it("reads the size from the variant name when the fields are missing, and from a JSON string", () => {
    const fromName = { parentName: "Bollard, Grey", name: "210 OD x 1200 mm", code: "S-01-07-0090" };
    expect(productDisplayName("Bollard, Grey", fromName)).toBe("iFlex 190 Bollard, 1.2 m, 210 OD, Grey");
    expect(productDisplayName("Bollard, Grey", JSON.stringify(fromName))).toBe("iFlex 190 Bollard, 1.2 m, 210 OD, Grey");
    // The raw spec sub-size (snake_case) plus its parent, as the catalogue card passes it.
    expect(productDisplayName("Bollard, Yellow", { parentName: "Bollard, Yellow", name: "190 OD x 835 mm", od_mm: 190, height_mm: 835 })).toBe("iFlex 190 Bollard, 835 mm, Yellow");
  });

  it("appends the size to any other row that has sub-sizes", () => {
    expect(productDisplayName("Heavy Duty Bollard, Yellow, GALV", sv("Heavy Duty Bollard, Yellow, GALV", "210 OD x 1200 mm", 1200, 210, "S-01-07-0073"))).toBe(
      "Heavy Duty Bollard, Yellow, GALV, 1.2 m, 210 OD",
    );
  });

  it("ignores a variant that is not a sub-size of this row", () => {
    // Length / tier variants on other lines carry no parentName.
    expect(productDisplayName("iFlex Single Traffic", { name: "iFlex Single Traffic - 1600mm", length: 1600, height: 395 })).toBe("iFlex Single Traffic");
    // A variant recorded against a different row never renames this one.
    expect(productDisplayName("Bollard, Grey", sv("Bollard, Yellow", "190 OD x 1200 mm", 1200, 190, "S-01-07-0053"))).toBe("iFlex 190 Bollard, Grey");
    expect(productDisplayName("Bollard, Yellow", 3)).toBe("iFlex 190 Bollard, Yellow");
    expect(productDisplayName("Bollard, Yellow", "not json")).toBe("iFlex 190 Bollard, Yellow");
  });
});

describe("productDisplayName — names alone", () => {
  it("names the bare rows as the product line without claiming a size", () => {
    expect(productDisplayName("Bollard, Yellow")).toBe("iFlex 190 Bollard, Yellow");
    expect(productDisplayName("Bollard, Grey")).toBe("iFlex 190 Bollard, Grey");
    expect(productDisplayName("  bollard, yellow ")).toBe("iFlex 190 Bollard, Yellow");
    expect(productDisplayName("Bollard,Grey", null)).toBe("iFlex 190 Bollard, Grey");
  });

  it("reads the 2 m SKU as the same line", () => {
    expect(productDisplayName("iFlex 190 Bollard - 2m")).toBe("iFlex 190 Bollard, 2 m");
    expect(productDisplayName("iFlex 190 Bollard – 1.2 m")).toBe("iFlex 190 Bollard, 1.2 m");
  });

  it("leaves every other name exactly as stored", () => {
    for (const name of [
      "Heavy Duty Bollard, Yellow, GALV",
      "Heavy Duty Bollard, Grey, GALV",
      "Cold Storage iFlex 190 Bollard",
      "Bollard, Grey - 210 OD x 1200 mm",
      "Bollard Bumper",
      "Monoplex 190 Bollard",
      "Sign Post, 1.2m - Yellow",
      "iFlex Single Traffic+",
      "190 OD x 1200 mm",
      "",
    ]) {
      expect(productDisplayName(name)).toBe(name);
    }
  });

  it("returns an empty string for a missing name", () => {
    expect(productDisplayName(null)).toBe("");
    expect(productDisplayName(undefined)).toBe("");
  });
});
