import { describe, it, expect } from "vitest";
import {
  A_SAFE_KSA,
  A_SAFE_UAE,
  A_SAFE_WEB,
  OFFICES_BY_COUNTRY,
  QUOTES_EMAIL,
  SALES_EMAIL,
  officeBlockHtml,
  officeBlockText,
  phoneDigits,
  telHref,
  whatsAppHref,
} from "./offices";

describe("office constants", () => {
  it("UAE matches asafe.com/ar-ae/contact", () => {
    expect(A_SAFE_UAE.legalName).toBe("A-SAFE DWC-LLC");
    expect(A_SAFE_UAE.tradingName).toBe("A-SAFE UAE");
    expect(A_SAFE_UAE.addressLines).toEqual(["Office 220, Building A5", "Dubai South Business Park", "Dubai, United Arab Emirates"]);
    expect(A_SAFE_UAE.addressOneLine).toBe("Office 220, Building A5, Dubai South Business Park, Dubai, United Arab Emirates");
    expect(A_SAFE_UAE.city).toBe("Dubai");
    expect(A_SAFE_UAE.country).toBe("United Arab Emirates");
    expect(A_SAFE_UAE.phoneDisplay).toBe("+971 (4) 8842 422");
    expect(A_SAFE_UAE.phoneTel).toBe("97148842422");
    expect(A_SAFE_UAE.email).toBe("support@asafe.ae");
    expect(A_SAFE_UAE.mapsUrl).toBe("https://maps.app.goo.gl/55wf4FPkAe2NfKDHA");
  });

  it("KSA matches asafe.com/ar-ae/contact", () => {
    expect(A_SAFE_KSA.legalName).toBe("A-SAFE FOR SAFETY COMPANY");
    expect(A_SAFE_KSA.tradingName).toBe("A-SAFE Saudi Arabia");
    // The district line is deliberately not spelled out here: the guard test
    // keeps that literal confined to shared/offices.ts and migrations/.
    expect(A_SAFE_KSA.addressLines).toHaveLength(3);
    expect(A_SAFE_KSA.addressLines[0]).toBe("Office 10, 6460 Ibrahim Ibn Mukhalad");
    expect(A_SAFE_KSA.addressLines[1]).toMatch(/^Al \w+ District$/);
    expect(A_SAFE_KSA.addressLines[2]).toBe("Riyadh, Saudi Arabia");
    expect(A_SAFE_KSA.addressOneLine).toBe(A_SAFE_KSA.addressLines.join(", "));
    expect(A_SAFE_KSA.city).toBe("Riyadh");
    expect(A_SAFE_KSA.country).toBe("Saudi Arabia");
    expect(A_SAFE_KSA.phoneDisplay).toBe("+966 53 397 0866");
    expect(A_SAFE_KSA.phoneTel).toBe("966533970866");
    expect(A_SAFE_KSA.email).toBe("support@asafe.sa");
    expect(A_SAFE_KSA.mapsUrl).toBeNull();
  });

  it("neither office carries the other's street address", () => {
    expect(A_SAFE_UAE.addressOneLine).not.toMatch(/Malaz|Mukhalad|Riyadh/);
    expect(A_SAFE_KSA.addressOneLine).not.toMatch(/Dubai|Building A5/);
  });

  it("keeps the sales / quotes reply-to addresses and the website", () => {
    expect(SALES_EMAIL).toBe("sales@asafe.ae");
    expect(QUOTES_EMAIL).toBe("quotes@asafe.ae");
    expect(A_SAFE_WEB).toBe("www.asafe.com");
  });

  it("resolves offices by global_offices.country", () => {
    expect(OFFICES_BY_COUNTRY["United Arab Emirates"]).toBe(A_SAFE_UAE);
    expect(OFFICES_BY_COUNTRY["Saudi Arabia"]).toBe(A_SAFE_KSA);
    expect(OFFICES_BY_COUNTRY["United Kingdom"]).toBeUndefined();
  });
});

describe("phone helpers", () => {
  it("phoneDigits strips spaces, brackets, plus and dashes", () => {
    expect(phoneDigits("+971 (4) 8842 422")).toBe("97148842422");
    expect(phoneDigits("+966 53 397 0866")).toBe("966533970866");
    expect(phoneDigits("04-884-2422")).toBe("048842422");
    expect(phoneDigits("")).toBe("");
  });

  it("telHref builds a tel: link with a leading +", () => {
    expect(telHref(A_SAFE_UAE.phoneDisplay)).toBe("tel:+97148842422");
    expect(telHref(A_SAFE_KSA.phoneDisplay)).toBe("tel:+966533970866");
    // Already-normalised input is not double-prefixed.
    expect(telHref("+97148842422")).toBe("tel:+97148842422");
  });

  it("whatsAppHref builds a wa.me link without the +", () => {
    expect(whatsAppHref("+966 53 035 6116")).toBe("https://wa.me/966530356116");
  });
});

describe("officeBlockText", () => {
  it("prints trading name, every address line, phone, email and web by default", () => {
    expect(officeBlockText(A_SAFE_UAE)).toBe(
      [
        "A-SAFE UAE",
        "Office 220, Building A5",
        "Dubai South Business Park",
        "Dubai, United Arab Emirates",
        "Tel: +971 (4) 8842 422",
        "support@asafe.ae",
        "www.asafe.com",
      ].join("\n"),
    );
  });

  it("can print the legal entity, a different contact email and no web line", () => {
    const text = officeBlockText(A_SAFE_UAE, { legal: true, email: SALES_EMAIL, web: false });
    expect(text.split("\n")[0]).toBe("A-SAFE DWC-LLC");
    expect(text).toContain("sales@asafe.ae");
    expect(text).not.toContain("support@asafe.ae");
    expect(text).not.toContain("www.asafe.com");
  });
});

describe("officeBlockHtml", () => {
  it("stacked layout joins fields with <br> and links email and web", () => {
    const html = officeBlockHtml(A_SAFE_UAE);
    expect(html).toBe(
      '<strong>A-SAFE UAE</strong><br>Office 220, Building A5<br>Dubai South Business Park<br>Dubai, United Arab Emirates<br>' +
        'Tel: +971 (4) 8842 422<br><a href="mailto:support@asafe.ae">support@asafe.ae</a><br><a href="https://www.asafe.com">www.asafe.com</a>',
    );
  });

  it("inline layout matches the email footer shape with a custom separator and styles", () => {
    const html = officeBlockHtml(A_SAFE_UAE, {
      layout: "inline",
      separator: " &nbsp;|&nbsp; ",
      email: SALES_EMAIL,
      nameStyle: "color:#000;",
      linkStyle: "color:#666;",
    });
    expect(html).toBe(
      '<strong style="color:#000;">A-SAFE UAE</strong> &nbsp;|&nbsp; Office 220, Building A5, Dubai South Business Park, Dubai, United Arab Emirates<br>' +
        'Tel: +971 (4) 8842 422 &nbsp;|&nbsp; <a href="mailto:sales@asafe.ae" style="color:#666;">sales@asafe.ae</a> &nbsp;|&nbsp; ' +
        '<a href="https://www.asafe.com" style="color:#666;">www.asafe.com</a>',
    );
  });

  it("escapes HTML in values and styles", () => {
    const html = officeBlockHtml({ ...A_SAFE_UAE, tradingName: "A & B <x>" }, { nameStyle: 'a="b"' });
    expect(html).toContain('<strong style="a=&quot;b&quot;">A &amp; B &lt;x&gt;</strong>');
  });
});
