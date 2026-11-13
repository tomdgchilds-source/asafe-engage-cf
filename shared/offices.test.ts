import { describe, it, expect } from "vitest";
import {
  A_SAFE_HQ_RECORD,
  A_SAFE_INTERNATIONAL_RECORD,
  A_SAFE_KSA,
  A_SAFE_KSA_PHONE_2,
  A_SAFE_KSA_RECORD,
  A_SAFE_OFFICES,
  A_SAFE_UAE,
  A_SAFE_UAE_RECORD,
  A_SAFE_UK_RECORD,
  A_SAFE_WEB,
  A_SAFE_WHATSAPP_ME,
  A_SAFE_WHATSAPP_ME_HREF,
  OFFICES_BY_COUNTRY,
  QUOTES_EMAIL,
  SALES_EMAIL,
  officeAddressLines,
  officeBlockHtml,
  officeBlockText,
  officeById,
  officeContactForRow,
  officeDetails,
  officeMapsHref,
  officePhoneHref,
  officeRowValues,
  officesServingCountry,
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

describe("A_SAFE_OFFICES (asafe.com contact pages, 2026-11-13)", () => {
  const byName = (legalName: string) => {
    const o = A_SAFE_OFFICES.find((x) => x.legalName === legalName);
    if (!o) throw new Error(`no office ${legalName}`);
    return o;
  };

  it("lists the 20 offices the website publishes, each with a fixed unique id", () => {
    expect(A_SAFE_OFFICES).toHaveLength(20);
    const ids = A_SAFE_OFFICES.map((o) => o.id);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("uses the website's legal entity and contact email for every country", () => {
    const expected: Array<[string, string, string]> = [
      ["United Kingdom", "A-SAFE UK Ltd", "sales@asafe.co.uk"],
      ["United Kingdom", "A-SAFE HQ Ltd", "sales@asafe.co.uk"],
      ["United Kingdom", "A-SAFE International Ltd", "international@asafe.com"],
      ["Belgium", "A-SAFE bvba", "customer.service@asafe.be"],
      ["Denmark", "A-SAFE ApS", "info@asafe.dk"],
      ["France", "A-SAFE SAS", "ventes@asafe.fr"],
      ["Germany", "A-SAFE GmbH", "vertrieb@asafe.de"],
      ["Italy", "A-SAFE Italia s.r.l.", "commerciale@asafe.it"],
      ["Netherlands", "A-SAFE B.V.", "info@asafe.nl"],
      ["Poland", "A-SAFE Sp. z o.o.", "polska@asafe.pl"],
      ["Spain", "A-SAFE Soluciones S.L.", "ventas@asafe.es"],
      ["Sweden", "A-SAFE AB", "info@asafe.se"],
      ["United Arab Emirates", "A-SAFE DWC-LLC", "support@asafe.ae"],
      ["Saudi Arabia", "A-SAFE FOR SAFETY COMPANY", "support@asafe.sa"],
      ["United States", "A-SAFE Inc", "sales@asafe.us"],
      ["United States", "A-SAFE, Sales HQ", "sales@asafe.us"],
      ["Canada", "A-SAFE Canada", "sales@a-safe.ca"],
      ["Mexico", "A-SAFE S.A. de C.V.", "ventas@asafe.mx"],
      ["Australia", "A-SAFE Australasia PTY Ltd", "sales@asafeau.com"],
      ["Japan", "A-SAFE K.K. (A-SAFE株式会社)", "info@asafe.jp"],
    ];
    expect(A_SAFE_OFFICES.map((o) => [o.country, o.legalName, o.email]).sort()).toEqual([...expected].sort());
  });

  it("never uses the invented <country>@asafe.com mailboxes", () => {
    for (const o of A_SAFE_OFFICES) {
      expect(o.email).not.toMatch(/^(australia|belgium|canada|japan|denmark|mexico|france|germany|italy|netherlands|poland|spain|sweden|usa|sales)@asafe\.com$/);
    }
  });

  it("spells addresses as the website does", () => {
    expect(officeAddressLines(byName("A-SAFE GmbH"))).toEqual(["Sitzkrüger Moor 6", "23879 Mölln", "Germany"]);
    expect(officeAddressLines(byName("A-SAFE ApS"))[0]).toBe("Rugvænget 46A");
    expect(officeAddressLines(byName("A-SAFE AB"))[0]).toBe("Varlabergsvägen 29");
    expect(officeAddressLines(byName("A-SAFE Soluciones S.L."))).toEqual([
      "C/ Botiguers 5, Edificio Manuel Borso",
      "Bloque A, oficina 202",
      "Parque Empresarial Táctica",
      "46980 Paterna, Valencia",
      "Spain",
    ]);
    expect(officeAddressLines(byName("A-SAFE Sp. z o.o."))).toEqual([
      "Budynek Spaces Platinum (5 piętro)",
      "ul. Domaniewska 44",
      "02-672 Warszawa",
      "Poland",
    ]);
    expect(officeAddressLines(byName("A-SAFE Italia s.r.l.")).join(", ")).toBe("Via Felice Matteucci, 19, 20862 Arcore MB, Italy");
    expect(officeAddressLines(byName("A-SAFE Inc")).join(", ")).toBe("400 North Zarfoss Drive, York, PA 17404, United States");
    expect(officeAddressLines(byName("A-SAFE, Sales HQ")).join(", ")).toBe("5801 Headquarters Dr, Plano, TX 75024, United States");
    expect(officeAddressLines(byName("A-SAFE S.A. de C.V."))).toContain("Queretaro, QRO 76220");
  });

  it("keeps each stored column inside the printed address", () => {
    for (const o of A_SAFE_OFFICES) {
      expect(o.addressLines.length).toBeGreaterThanOrEqual(1);
      expect(o.addressLines.length).toBeLessThanOrEqual(3);
      expect(o.cityLine).toContain(o.city);
      if (o.postalCode) expect(o.cityLine).toContain(o.postalCode);
    }
  });

  it("gives every phone a dialable E.164 form and the primary first", () => {
    for (const o of A_SAFE_OFFICES) {
      expect(o.phones.length).toBeGreaterThanOrEqual(1);
      expect(o.phoneDisplay).toBe(o.phones[0].display);
      for (const p of o.phones) expect(p.tel).toMatch(/^\+[1-9]\d{7,14}$/);
    }
    expect(byName("A-SAFE UK Ltd").phones).toEqual([{ display: "+44 (0)1422 331133", tel: "+441422331133" }]);
    expect(byName("A-SAFE HQ Ltd").phones[0].display).toBe("+44 (0)1422 344402");
    expect(byName("A-SAFE International Ltd").phones[0].display).toBe("+44 (0)1422 261661");
    expect(byName("A-SAFE Inc").phones[0]).toEqual({ display: "(443) 776 3472", tel: "+14437763472" });
    expect(byName("A-SAFE K.K. (A-SAFE株式会社)").phones[0]).toEqual({ display: "+81 742-32-5180", tel: "+81742325180" });
    expect(officePhoneHref(byName("A-SAFE bvba").phones[0])).toBe("tel:+3251433434");
  });

  it("lists both Riyadh numbers and flags only Mexico's phone as unverified", () => {
    expect(A_SAFE_KSA_RECORD.phones.map((p) => p.display)).toEqual([A_SAFE_KSA.phoneDisplay, A_SAFE_KSA_PHONE_2]);
    expect(A_SAFE_KSA_PHONE_2).toBe("+966 53 035 6116");
    expect(A_SAFE_OFFICES.filter((o) => !o.phoneVerified).map((o) => o.country)).toEqual(["Mexico"]);
  });

  it("has one default office per region and unique sort orders within a region", () => {
    const regions = new Map<string, typeof A_SAFE_OFFICES[number][]>();
    for (const o of A_SAFE_OFFICES) regions.set(o.region, [...(regions.get(o.region) ?? []), o]);
    expect([...regions.keys()].sort()).toEqual(["Americas", "Asia Pacific", "Europe", "International", "Middle East"]);
    for (const [region, list] of regions) {
      expect(new Set(list.map((o) => o.sortOrder)).size).toBe(list.length);
      if (region !== "International") expect(list.filter((o) => o.isDefault)).toHaveLength(1);
    }
    expect(A_SAFE_UK_RECORD.isDefault).toBe(true);
    expect(A_SAFE_OFFICES.filter((o) => o.isHeadOffice)).toEqual([A_SAFE_HQ_RECORD]);
  });

  it("derives the Middle East print blocks from the list", () => {
    expect(A_SAFE_UAE).toEqual(officeDetails(A_SAFE_UAE_RECORD));
    expect(A_SAFE_KSA).toEqual(officeDetails(A_SAFE_KSA_RECORD));
    expect(officeById(A_SAFE_UAE_RECORD.id)).toBe(A_SAFE_UAE_RECORD);
    expect(officeById("nope")).toBeUndefined();
  });

  it("routes a country to the offices whose contact page covers it", () => {
    expect(officesServingCountry("Austria").map((o) => o.legalName)).toEqual(["A-SAFE GmbH"]);
    expect(officesServingCountry("New Zealand")).toEqual([byName("A-SAFE Australasia PTY Ltd")]);
    expect(officesServingCountry("United Kingdom")[0]).toBe(A_SAFE_UK_RECORD);
    expect(officesServingCountry("United States")[0]).toBe(byName("A-SAFE Inc"));
    expect(officesServingCountry("Switzerland").map((o) => o.country).sort()).toEqual(["France", "Germany", "Italy"]);
    expect(officesServingCountry("Brazil")).toEqual([A_SAFE_INTERNATIONAL_RECORD]);
    expect(A_SAFE_INTERNATIONAL_RECORD.email).toBe("international@asafe.com");
  });

  it("publishes one WhatsApp number, for the Middle East offices only", () => {
    expect(A_SAFE_WHATSAPP_ME_HREF).toBe("https://wa.me/971508842131");
    expect(A_SAFE_OFFICES.filter((o) => o.whatsApp).map((o) => o.country)).toEqual(["United Arab Emirates", "Saudi Arabia"]);
    expect(A_SAFE_UAE_RECORD.whatsApp).toBe(A_SAFE_WHATSAPP_ME);
  });
});

describe("map links", () => {
  it("uses A-SAFE's own short link when one is published", () => {
    expect(officeMapsHref(A_SAFE_UAE_RECORD)).toBe(A_SAFE_UAE.mapsUrl);
  });

  it("builds a Google Maps link from the website's lat/lng otherwise", () => {
    expect(officeMapsHref(A_SAFE_UK_RECORD)).toBe("https://www.google.com/maps/search/?api=1&query=53.6775574%2C-1.8339226");
    expect(officeMapsHref(A_SAFE_KSA_RECORD)).toMatch(/query=24\.66886602\d*%2C46\.72909491\d*$/);
  });

  it("searches by address where the website's pin is known to be off", () => {
    const off = A_SAFE_OFFICES.filter((o) => !o.pinMatchesAddress).map((o) => o.country);
    expect(off).toEqual(["Belgium", "Italy", "Poland", "United Arab Emirates"]);
    const href = officeMapsHref(A_SAFE_OFFICES.find((o) => o.country === "Belgium")!);
    expect(decodeURIComponent(href)).toContain("query=A-SAFE bvba, Krommebeekstraat 56A, 8930 Menen, Belgium");
    expect(href).not.toContain("50.942429");
  });
});

describe("officeRowValues / officeContactForRow", () => {
  it("maps a record onto the global_offices columns", () => {
    expect(officeRowValues(A_SAFE_UK_RECORD)).toEqual({
      id: "98306d62-bf0c-4f8b-9e49-5bfcd3f14f9d",
      companyName: "A-SAFE UK Ltd",
      officeType: "office",
      region: "Europe",
      country: "United Kingdom",
      city: "Halifax",
      addressLine1: "Habergham Works",
      addressLine2: "Ainleys Industrial Estate",
      addressLine3: "Elland",
      postalCode: "HX5 9JP",
      phone: "+44 (0)1422 331133",
      email: "sales@asafe.co.uk",
      imageUrl: "https://flagcdn.com/w80/gb.png",
      googleMapsUrl: null,
      latitude: "53.67755740",
      longitude: "-1.83392260",
      isActive: true,
      isDefault: true,
      sortOrder: 1,
    });
    const germany = officeRowValues(A_SAFE_OFFICES.find((o) => o.country === "Germany")!);
    expect([germany.addressLine2, germany.addressLine3]).toEqual([null, null]);
  });

  it("shows legal name, full address, every phone, email and a map link for a row in step with its record", () => {
    const c = officeContactForRow(officeRowValues(A_SAFE_KSA_RECORD));
    expect(c.legalName).toBe("A-SAFE FOR SAFETY COMPANY");
    expect(c.addressLines).toEqual(officeAddressLines(A_SAFE_KSA_RECORD));
    expect(c.phones.map(officePhoneHref)).toEqual(["tel:+966533970866", "tel:+966530356116"]);
    expect(c.email).toBe("support@asafe.sa");
    expect(c.mapsHref).toBe(officeMapsHref(A_SAFE_KSA_RECORD));
    expect(c.whatsApp).toBe(A_SAFE_WHATSAPP_ME);

    const japan = officeContactForRow(officeRowValues(A_SAFE_OFFICES.find((o) => o.country === "Japan")!));
    expect(japan.addressLinesNative).toHaveLength(3);
    expect(japan.whatsApp).toBeNull();
  });

  it("shows a row an admin has edited (or a row with no record) as the row stands", () => {
    const edited = { ...officeRowValues(A_SAFE_UK_RECORD), phone: "+44 (0)1422 000000", email: "new@example.com" };
    const c = officeContactForRow(edited);
    expect(c.phones).toEqual([{ display: "+44 (0)1422 000000", tel: "+441422000000" }]);
    expect(c.email).toBe("new@example.com");
    expect(c.addressLines).toEqual(["Habergham Works", "Ainleys Industrial Estate", "Elland", "Halifax, HX5 9JP", "United Kingdom"]);
    expect(c.mapsHref).toBe("https://www.google.com/maps/search/?api=1&query=53.67755740%2C-1.83392260");

    const unknown = officeContactForRow({
      id: "00000000-0000-4000-8000-000000000000",
      companyName: "A-SAFE Reseller",
      country: "Portugal",
      city: "Lisboa",
      addressLine1: "Rua 1",
      addressLine2: null,
      postalCode: "1000-001",
      phone: "(21) 000 0000",
      email: "reseller@example.com",
      latitude: null,
      longitude: null,
    });
    expect(unknown.legalName).toBe("A-SAFE Reseller");
    expect(unknown.phones[0].tel).toBe("210000000");
    expect(decodeURIComponent(unknown.mapsHref)).toContain("query=Rua 1, Lisboa, 1000-001, Portugal");
    expect(unknown.whatsApp).toBeNull();
  });
});
