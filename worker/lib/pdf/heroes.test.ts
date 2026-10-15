import { describe, it, expect, beforeEach } from "vitest";
import type { Env } from "../../types";
import {
  chooseHeroCandidate,
  heroCaption,
  pickHeroImage,
  pickHeroUrl,
  primeHeroRows,
  referenceCaption,
  resetHeroCache,
  resolveHeroIndustries,
  type HeroCandidate,
} from "./heroes";

// The live catalogue as of 2026-10 (industry values exactly as stored).
const ROWS: HeroCandidate[] = [
  { id: "optimat", title: "OptimaT loading docks", industry: "Warehousing & Logistics", company: "OptimaT", imageUrl: "https://webcdn.asafe.com/media/qird1yni/optimat.jpg", createdAt: "2026-01-10" },
  { id: "heineken", title: "Heineken Dutch production facility", industry: "Food & Beverage", company: "Heineken", imageUrl: "https://webcdn.asafe.com/media/4079/heineken-2_3000x1200.jpg", createdAt: "2026-01-09" },
  { id: "heathrow", title: "Heathrow airside protection", industry: "airports", company: "Heathrow Airport", imageUrl: "https://webcdn.asafe.com/media/3468/heathrow_3000x1200.jpg", createdAt: "2026-01-08" },
  { id: "vw", title: "Volkswagen facility", industry: "automotive", company: "Volkswagen", imageUrl: "https://webcdn.asafe.com/media/3485/vw_3000x1200.jpg", createdAt: "2026-01-07" },
  { id: "dhl", title: "DHL distribution centre", industry: "Warehousing & Logistics", company: "DHL", imageUrl: "https://webcdn.asafe.com/media/4806/dhl-bedford-1_2.jpg", createdAt: "2026-01-06" },
  { id: "sonoco", title: "Sonoco recycling facility", industry: "recycling-packaging", company: "Sonoco", imageUrl: "https://webcdn.asafe.com/media/8585/drone_sonoco_001.jpg", createdAt: "2026-01-05" },
  { id: "ekfc", title: "Emirates Flight Catering", industry: "airports", company: "Emirates Flight Catering", imageUrl: "https://webcdn.asafe.com/media/cn5ag0ev/ekfc.jpg", createdAt: "2026-01-04" },
  { id: "nophoto", title: "Unpublished draft", industry: "manufacturing", company: "Draft Co", imageUrl: null },
  { id: "offhost", title: "Photo on a foreign host", industry: "automotive", company: "Nope", imageUrl: "https://example.com/x.jpg" },
  { id: "unpublished", title: "Hidden", industry: "airports", company: "Hidden", imageUrl: "https://webcdn.asafe.com/media/zz/hidden.jpg", isPublished: false },
];

describe("resolveHeroIndustries", () => {
  it("defaults to warehousing & logistics with no signal", () => {
    expect(resolveHeroIndustries({})).toEqual(["Warehousing & Logistics"]);
    expect(resolveHeroIndustries({ areaTypes: ["Columns (Structural / Mezzanine)", "Electrical DBs"] })[0]).toBe("Warehousing & Logistics");
  });

  it("maps customer industries and facility types to the case-study catalogue", () => {
    expect(resolveHeroIndustries({ industry: "Food & Beverage" })[0]).toBe("Food & Beverage");
    expect(resolveHeroIndustries({ industry: "food-and-drink" })[0]).toBe("Food & Beverage");
    expect(resolveHeroIndustries({ industry: "Pharmaceuticals" })[0]).toBe("Food & Beverage");
    expect(resolveHeroIndustries({ industry: "Aviation" })[0]).toBe("airports");
    expect(resolveHeroIndustries({ facilityType: "airport cargo terminal" })[0]).toBe("airports");
    expect(resolveHeroIndustries({ industry: "Automotive" })[0]).toBe("automotive");
    expect(resolveHeroIndustries({ industry: "Manufacturing" }).slice(0, 2)).toEqual(["manufacturing", "automotive"]);
    expect(resolveHeroIndustries({ industry: "Recycling" })[0]).toBe("recycling-packaging");
    expect(resolveHeroIndustries({ industry: "3PL logistics" })[0]).toBe("Warehousing & Logistics");
    expect(resolveHeroIndustries({ industry: "Parking" }).slice(0, 2)).toEqual(["parking-lot", "Warehousing & Logistics"]);
  });

  it("reads survey area types and free text when there is no explicit industry", () => {
    expect(resolveHeroIndustries({ areaTypes: ["Cold Store Walls", "Racking"] })[0]).toBe("Food & Beverage");
    expect(resolveHeroIndustries({ areaTypes: ["Loading Docks", "Racking", "Shutter Doors"] })[0]).toBe("Warehousing & Logistics");
    expect(resolveHeroIndustries({ text: "Emirates Flight Catering, Dubai Airport Free Zone" })[0]).toBe("airports");
    expect(resolveHeroIndustries({ text: "Al Quoz brewery bottling hall" })[0]).toBe("Food & Beverage");
  });

  it("lets the explicit industry outrank weaker text signals", () => {
    expect(resolveHeroIndustries({ industry: "automotive", text: "warehouse racking loading dock" })[0]).toBe("automotive");
  });
});

describe("chooseHeroCandidate", () => {
  it("ignores rows without a CDN photo, foreign hosts and unpublished rows", () => {
    expect(chooseHeroCandidate(ROWS, { industry: "manufacturing" })?.id).toBe("vw");
    expect(chooseHeroCandidate([ROWS[7], ROWS[8], ROWS[9]], {})).toBeNull();
  });

  it("walks down the ranking when the top industry has no photo", () => {
    expect(chooseHeroCandidate(ROWS, { industry: "parking" })?.industry).toBe("Warehousing & Logistics");
  });

  it("is stable for a seed and spreads different seeds across the group", () => {
    const a = chooseHeroCandidate(ROWS, { industry: "airports", seed: "survey-1" })?.id;
    const b = chooseHeroCandidate(ROWS, { industry: "airports", seed: "survey-1" })?.id;
    expect(a).toBe(b);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(chooseHeroCandidate(ROWS, { industry: "airports", seed: `s${i}` })!.id);
    expect(seen.size).toBe(2);
  });

  it("falls back to the newest logistics photo with no context", () => {
    expect(chooseHeroCandidate(ROWS, {})?.id).toBe("optimat");
  });
});

describe("captions", () => {
  it("name the client and industry, and the cover caption says it is not the client's site", () => {
    const c = heroCaption(ROWS[1]);
    expect(c).toBe("A-SAFE installation at Heineken, food & beverage");
    expect(referenceCaption({ caption: c })).toBe("Reference photograph — A-SAFE installation at Heineken, food & beverage. Not the client's site.");
    expect(heroCaption(ROWS[3])).toBe("A-SAFE installation at Volkswagen, automotive manufacturing");
    expect(heroCaption(ROWS[5])).toBe("A-SAFE installation at Sonoco, recycling & packaging");
  });
});

describe("pickers", () => {
  beforeEach(() => {
    resetHeroCache();
    primeHeroRows(ROWS);
  });

  it("pickHeroUrl returns the CDN URL and caption without fetching", async () => {
    const pick = await pickHeroUrl({} as Env, { industry: "Food & Beverage" });
    expect(pick).toMatchObject({ url: ROWS[1].imageUrl, client: "Heineken", industry: "Food & Beverage" });
  });

  it("pickHeroImage never fabricates bytes: null when every fetch fails", async () => {
    // No network in unit tests: fetch rejects, fetchImageBytes returns null,
    // the picker walks the ranking and gives up with null.
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    try {
      expect(await pickHeroImage({} as Env, { industry: "airports" })).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("pickHeroImage returns real JPEG bytes from the CDN URL when the fetch succeeds", async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
    const original = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(jpeg, { status: 200, headers: { "content-length": String(jpeg.length) } });
    }) as typeof fetch;
    try {
      const pick = await pickHeroImage({} as Env, { industry: "automotive", seed: "order-9" });
      expect(pick?.client).toBe("Volkswagen");
      expect(pick?.bytes).toEqual(jpeg);
      expect(pick?.sourceUrl).toBe(ROWS[3].imageUrl);
      expect(urls[0]).toContain("webcdn.asafe.com");
    } finally {
      globalThis.fetch = original;
    }
  });
});
