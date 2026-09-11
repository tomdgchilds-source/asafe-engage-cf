import { describe, it, expect, vi } from "vitest";
import {
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_MAX_ATTEMPTS,
  generateOrderNumber,
  isUniqueViolation,
  insertWithUniqueOrderNumber,
} from "./orders";
import {
  FALLBACK_FX_RATES,
  formatMoney,
  orderItemsToPricingLines,
  resolveFxRate,
} from "../lib/money";

// Deterministic "random" source: hands back the bytes you give it.
const fixedBytes = (bytes: number[]) => (n: number) => Uint8Array.from(bytes.slice(0, n));

describe("generateOrderNumber", () => {
  const now = new Date(Date.UTC(2026, 8, 11, 13, 45, 0)); // 2026-09-11

  it("renders ENG_QUOAE + YYMMDD + 5-char base36 tail", () => {
    const n = generateOrderNumber(now, fixedBytes([0, 1, 2, 35, 10]));
    expect(n).toMatch(/^ENG_QUOAE\d{6}[A-Z0-9]{5}$/);
    expect(n.startsWith(`${ORDER_NUMBER_PREFIX}260911`)).toBe(true);
  });

  it("maps bytes onto the A-Z0-9 alphabet", () => {
    expect(generateOrderNumber(now, fixedBytes([0, 1, 2, 35, 10]))).toBe("ENG_QUOAE260911ABC9K");
  });

  it("rejects bytes outside the unbiased range instead of wrapping them", () => {
    // 252..255 are skipped (252 = 7 × 36) so the modulo has no bias.
    expect(generateOrderNumber(now, fixedBytes([255, 252, 0, 1, 2, 3, 4]))).toBe(
      "ENG_QUOAE260911ABCDE",
    );
  });

  it("uses crypto.getRandomValues by default and never repeats trivially", () => {
    const a = generateOrderNumber(now);
    const b = generateOrderNumber(now);
    expect(a).toMatch(/^ENG_QUOAE260911[A-Z0-9]{5}$/);
    expect(b).toMatch(/^ENG_QUOAE260911[A-Z0-9]{5}$/);
    expect(a).not.toBe(b);
  });
});

describe("isUniqueViolation", () => {
  it("recognises Postgres 23505 and duplicate-key messages", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint "orders_order_number_unique"'))).toBe(true);
  });
  it("is false for anything else", () => {
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });
});

describe("insertWithUniqueOrderNumber", () => {
  const now = new Date(Date.UTC(2026, 8, 11));
  // Counter-based byte source so each attempt gets a different tail.
  const counting = () => {
    let i = 0;
    return (n: number) => Uint8Array.from({ length: n }, () => (i++ % 36));
  };

  it("returns on the first attempt when the insert succeeds", async () => {
    const insert = vi.fn(async (orderNumber: string) => ({ id: "o1", orderNumber }));
    const res = await insertWithUniqueOrderNumber(insert, { now, randomBytes: counting() });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(res.attempts).toBe(1);
    expect(res.order.orderNumber).toBe(res.orderNumber);
  });

  it("retries with a fresh tail on a unique violation", async () => {
    const seen: string[] = [];
    const insert = vi.fn(async (orderNumber: string) => {
      seen.push(orderNumber);
      if (seen.length < 3) throw { code: "23505" };
      return { id: "o1", orderNumber };
    });
    const res = await insertWithUniqueOrderNumber(insert, { now, randomBytes: counting() });
    expect(insert).toHaveBeenCalledTimes(3);
    expect(res.attempts).toBe(3);
    expect(new Set(seen).size).toBe(3);
    expect(res.orderNumber).toBe(seen[2]);
  });

  it(`gives up after ${ORDER_NUMBER_MAX_ATTEMPTS} unique violations`, async () => {
    const insert = vi.fn(async () => {
      throw { code: "23505" };
    });
    await expect(
      insertWithUniqueOrderNumber(insert, { now, randomBytes: counting() }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(insert).toHaveBeenCalledTimes(ORDER_NUMBER_MAX_ATTEMPTS);
  });

  it("rethrows non-unique errors immediately", async () => {
    const insert = vi.fn(async () => {
      throw new Error("connection reset");
    });
    await expect(insertWithUniqueOrderNumber(insert, { now })).rejects.toThrow("connection reset");
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("orderItemsToPricingLines", () => {
  it("maps cart rows onto PricingLine, normalising the per-metre vocabulary", () => {
    const lines = orderItemsToPricingLines([
      { id: "a", unitPrice: 100, quantity: 3, pricingType: "per-unit", requiresDelivery: true, requiresInstallation: true },
      { id: "b", unitPrice: 50, quantity: 2.4, pricingType: "linear_meter", requiresDelivery: false },
      { id: "c", unitPrice: "75.5", quantity: "2", pricingType: "per_meter", requiresInstallation: true },
    ]);
    expect(lines).toEqual([
      { id: "a", unitPriceAed: 100, quantity: 3, pricingType: "per-unit", includesDelivery: true, includesInstall: true, isProduct: true },
      { id: "b", unitPriceAed: 50, quantity: 2.4, pricingType: "per-meter", includesDelivery: false, includesInstall: false, isProduct: true },
      { id: "c", unitPriceAed: 75.5, quantity: 2, pricingType: "per-meter", includesDelivery: false, includesInstall: true, isProduct: true },
    ]);
  });

  it("falls back to an index id and ignores junk numbers", () => {
    const [l] = orderItemsToPricingLines([{ unitPrice: "abc", quantity: null, pricingType: "single_item" }]);
    expect(l.id).toBe("line-0");
    expect(l.unitPriceAed).toBe(0);
    expect(l.quantity).toBe(0);
    expect(l.pricingType).toBe("per-unit");
  });
});

describe("formatMoney / resolveFxRate", () => {
  it("converts AED through the stored rate and formats with the currency code", () => {
    expect(formatMoney(1000, "AED", 1)).toBe("AED 1,000.00");
    expect(formatMoney(1000, "GBP", 0.2)).toBe("GBP 200.00");
    expect(formatMoney(1234.5, "usd", 0.27)).toBe("USD 333.32");
  });
  it("treats a missing / invalid rate as 1 and AED as always 1", () => {
    expect(formatMoney(10, "AED", 0.5)).toBe("AED 10.00");
    expect(formatMoney(10, "GBP", null)).toBe("GBP 10.00");
    expect(formatMoney(NaN, "GBP", 0.2)).toBe("GBP 0.00");
  });
  it("resolveFxRate returns 1 for AED and the table rate otherwise", async () => {
    expect(await resolveFxRate("AED", async () => ({ GBP: 0.19 }))).toBe(1);
    expect(await resolveFxRate("GBP", async () => ({ GBP: 0.19 }))).toBe(0.19);
    expect(await resolveFxRate("GBP", async () => { throw new Error("down"); })).toBe(FALLBACK_FX_RATES.GBP);
    expect(await resolveFxRate("XXX", async () => ({}))).toBe(1);
  });
});
