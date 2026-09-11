import { describe, it, expect } from "vitest";
import { createEmptyDoc, parseLayoutDoc, isStampElement, isPolylineElement, elementPoints, type LayoutDoc } from "./doc";

describe("createEmptyDoc", () => {
  it("is version 1 with no elements", () => {
    expect(createEmptyDoc()).toEqual({ version: 1, elements: [] });
  });
});

describe("parseLayoutDoc", () => {
  it("accepts a valid document and drops malformed elements", () => {
    const raw = {
      version: 1,
      calibration: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lengthMm: 100 },
      vehicleTypeId: "vt",
      elements: [
        { kind: "barrierRun", id: "r1", familyId: "iflex-single-traffic", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { kind: "stamp", id: "s1", familyId: "bollard-190", at: { x: 1, y: 1 }, rotationDeg: 90 },
        { kind: "note", id: "n1", at: { x: 2, y: 2 }, text: "t" },
        { kind: "bogus", id: "x" },
        { kind: "barrierRun", id: "r2", familyId: "iflex-single-traffic", points: "nope" },
        { kind: "dimension", id: "d1", a: { x: 0, y: 0 }, b: { x: 5, y: 5 } },
        { kind: "wall", id: "w1", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] },
        { kind: "zone", id: "z1", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], label: "ped" },
      ],
    };
    const doc = parseLayoutDoc(raw);
    expect(doc).not.toBeNull();
    expect(doc!.elements.map((e) => e.id)).toEqual(["r1", "s1", "n1", "d1", "w1", "z1"]);
    expect(doc!.calibration?.lengthMm).toBe(100);
    expect(doc!.vehicleTypeId).toBe("vt");
  });
  it("rejects non-objects, wrong versions and bad calibrations", () => {
    expect(parseLayoutDoc(null)).toBeNull();
    expect(parseLayoutDoc("x")).toBeNull();
    expect(parseLayoutDoc({ version: 2, elements: [] })).toBeNull();
    expect(parseLayoutDoc({ version: 1 })).toBeNull();
    const doc = parseLayoutDoc({ version: 1, elements: [], calibration: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, lengthMm: "ten" } });
    expect(doc).not.toBeNull();
    expect(doc!.calibration).toBeUndefined();
  });
});

describe("element helpers", () => {
  const doc: LayoutDoc = {
    version: 1,
    elements: [
      { kind: "stamp", id: "s", familyId: "bollard-190", at: { x: 1, y: 2 }, rotationDeg: 0 },
      { kind: "wall", id: "w", points: [{ x: 0, y: 0 }, { x: 3, y: 3 }] },
      { kind: "dimension", id: "d", a: { x: 0, y: 0 }, b: { x: 9, y: 9 } },
    ],
  };
  it("classifies and extracts points", () => {
    expect(isStampElement(doc.elements[0])).toBe(true);
    expect(isPolylineElement(doc.elements[1])).toBe(true);
    expect(isPolylineElement(doc.elements[0])).toBe(false);
    expect(elementPoints(doc.elements[0])).toEqual([{ x: 1, y: 2 }]);
    expect(elementPoints(doc.elements[1])).toEqual([{ x: 0, y: 0 }, { x: 3, y: 3 }]);
    expect(elementPoints(doc.elements[2])).toEqual([{ x: 0, y: 0 }, { x: 9, y: 9 }]);
  });
});
