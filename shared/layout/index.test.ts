import { describe, it, expect } from "vitest";
import * as layout from "./index";

describe("shared/layout barrel", () => {
  it("re-exports the public surface", () => {
    expect(typeof layout.createEmptyDoc).toBe("function");
    expect(typeof layout.parseLayoutDoc).toBe("function");
    expect(typeof layout.familyForProduct).toBe("function");
    expect(typeof layout.FAMILIES).toBe("object");
    expect(typeof layout.pxPerMm).toBe("function");
    expect(typeof layout.postPositions).toBe("function");
    expect(typeof layout.hitTest).toBe("function");
    expect(typeof layout.deriveQuantities).toBe("function");
    expect(typeof layout.toCartItems).toBe("function");
    expect(typeof layout.markupsToDoc).toBe("function");
  });
});
