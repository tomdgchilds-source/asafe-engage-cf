import { describe, it, expect } from "vitest";
import { FAMILIES, FAMILY_IDS, familyForProduct, getFamily, isStampFamily, type FamilyId } from "./symbols";

describe("FAMILIES", () => {
  it("has every family the plan calls for", () => {
    const required: FamilyId[] = [
      "iflex-single-traffic",
      "iflex-double-traffic",
      "iflex-double-traffic-plus",
      "eflex-single-traffic",
      "mflex-single-traffic",
      "atlas-double-traffic",
      "pedestrian-3-rail",
      "rackguard",
      "rack-end-single",
      "bollard-130",
      "bollard-190",
      "bollard-heavy-duty",
      "column-guard",
      "dock-buffer",
      "forkguard",
      "height-restrictor",
      "tape-barrier",
    ];
    for (const id of required) expect(FAMILIES[id], id).toBeDefined();
  });
  it("uses stable kebab-case ids, unique colours and unique legend letters", () => {
    const colours = new Set<string>();
    const letters = new Set<string>();
    for (const id of FAMILY_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      const f = FAMILIES[id];
      expect(f.colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(f.letter).toMatch(/^[A-Z]$/);
      expect(colours.has(f.colour), `duplicate colour ${f.colour} on ${id}`).toBe(false);
      expect(letters.has(f.letter), `duplicate letter ${f.letter} on ${id}`).toBe(false);
      colours.add(f.colour);
      letters.add(f.letter);
      // Colours must read on a white sheet: relative luminance below ~0.5.
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(f.colour.slice(i, i + 2), 16) / 255);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(lum, `${id} colour too light for white`).toBeLessThan(0.5);
    }
  });
  it("ports the post OD / rail width / spacing table from barrierSymbol.ts", () => {
    expect(FAMILIES["iflex-single-traffic"]).toMatchObject({ postOdMm: 190, widthMm: 125, postSpacingMm: 2200, strokeStyle: "double" });
    expect(FAMILIES["eflex-single-traffic"]).toMatchObject({ postOdMm: 130, widthMm: 75, postSpacingMm: 2200 });
    expect(FAMILIES["mflex-single-traffic"]).toMatchObject({ postOdMm: 158, widthMm: 80 });
    expect(FAMILIES["atlas-double-traffic"]).toMatchObject({ postOdMm: 190, widthMm: 130 });
    expect(FAMILIES["pedestrian-3-rail"]).toMatchObject({ postOdMm: 190, widthMm: 60, strokeStyle: "single" });
    expect(FAMILIES["tape-barrier"].strokeStyle).toBe("dashed");
  });
  it("stamp families declare a stamp shape; run families do not", () => {
    expect(FAMILIES["bollard-190"].stampShape).toBe("circle");
    expect(FAMILIES["column-guard"].stampShape).toBe("square");
    expect(FAMILIES["dock-buffer"].stampShape).toBe("rect");
    expect(FAMILIES["iflex-single-traffic"].stampShape).toBeUndefined();
    expect(isStampFamily("bollard-130")).toBe(true);
    expect(isStampFamily("rackguard")).toBe(false);
  });
  it("getFamily falls back to the default family for unknown ids", () => {
    expect(getFamily("iflex-double-traffic").label).toMatch(/iFlex Double Traffic/);
    expect(getFamily("not-a-family").id).toBe("iflex-single-traffic");
  });
});

describe("familyForProduct", () => {
  it("maps the live catalogue names", () => {
    expect(familyForProduct({ name: "iFlex Single Traffic Barrier" })).toBe("iflex-single-traffic");
    expect(familyForProduct({ name: "iFlex Single Traffic Barrier+" })).toBe("iflex-single-traffic-plus");
    expect(familyForProduct({ name: "iFlex Double Traffic Barrier" })).toBe("iflex-double-traffic");
    expect(familyForProduct({ name: "iFlex Double Traffic Barrier+" })).toBe("iflex-double-traffic-plus");
    expect(familyForProduct({ name: "eFlex Single Traffic Barrier+" })).toBe("eflex-single-traffic-plus");
    expect(familyForProduct({ name: "mFlex Double Traffic Barrier" })).toBe("mflex-double-traffic");
    expect(familyForProduct({ name: "Atlas Double Traffic Barrier+" })).toBe("atlas-double-traffic-plus");
    expect(familyForProduct({ name: "iFlex RackGuard" })).toBe("rackguard");
    expect(familyForProduct({ name: "eFlex Single Rack End Barrier" })).toBe("rack-end-single");
    expect(familyForProduct({ name: "eFlex Double Rack End Barrier" })).toBe("rack-end-double");
    expect(familyForProduct({ name: "Bollard, Yellow" })).toBe("bollard-190");
    expect(familyForProduct({ name: "Monoplex Bollard" })).toBe("bollard-130");
    expect(familyForProduct({ name: "Heavy Duty Bollard, Grey, GALV" })).toBe("bollard-heavy-duty");
    expect(familyForProduct({ name: "FlexiShield Column Guard" })).toBe("column-guard");
    expect(familyForProduct({ name: "Dock Buffer (Pair)" })).toBe("dock-buffer");
    expect(familyForProduct({ name: "ForkGuard Kerb Barrier" })).toBe("forkguard");
    expect(familyForProduct({ name: "HD ForkGuard Kerb Barrier" })).toBe("forkguard");
    expect(familyForProduct({ name: "iFlex Height Restrictor" })).toBe("height-restrictor");
    expect(familyForProduct({ name: "iFlex Pedestrian 3 Rail Barrier" })).toBe("pedestrian-3-rail");
    expect(familyForProduct({ name: "Tape Barrier" })).toBe("tape-barrier");
  });
  it("prefers an explicit suitabilityData.family when it is a known id", () => {
    expect(familyForProduct({ name: "Mystery", suitabilityData: { family: "atlas-double-traffic" } })).toBe("atlas-double-traffic");
    expect(familyForProduct({ name: "iFlex Single Traffic Barrier", suitabilityData: { family: "nonsense" } })).toBe("iflex-single-traffic");
  });
  it("falls back by category, then deterministically", () => {
    expect(familyForProduct({ name: "Something", category: "bollards" })).toBe("bollard-190");
    expect(familyForProduct({ name: "Something", category: "bollards", subcategory: "heavy-duty-bollard" })).toBe("bollard-heavy-duty");
    expect(familyForProduct({ name: "Something", category: "column-protection" })).toBe("column-guard");
    expect(familyForProduct({ name: "Something", category: "rack-protection" })).toBe("rackguard");
    expect(familyForProduct({ name: "Something", category: "pedestrian-barriers" })).toBe("pedestrian-3-rail");
    expect(familyForProduct({ name: "Something", category: "traffic-guardrails", subcategory: "double-rail" })).toBe("iflex-double-traffic");
    expect(familyForProduct({ name: "Something", category: "dock-protection" })).toBe("dock-buffer");
    expect(familyForProduct({ name: "Something", category: "height-restrictors" })).toBe("height-restrictor");
    expect(familyForProduct({})).toBe("iflex-single-traffic");
    expect(familyForProduct(null)).toBe("iflex-single-traffic");
    expect(familyForProduct({ name: "Totally unknown widget" })).toBe("iflex-single-traffic");
  });
});
