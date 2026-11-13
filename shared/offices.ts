/**
 * shared/offices.ts
 *
 * The single source of truth for every A-SAFE office: legal entity, address,
 * phone(s), email and map position, exactly as published on the contact
 * pages of https://www.asafe.com (fetched 2026-11-13; the Middle East rows
 * were first verified against /ar-ae/contact/ on 2026-10-15).
 *
 *   - `A_SAFE_OFFICES` is the full list. `global_offices` rows are generated
 *     from it (migrations/2026-11-13-011 via scripts/buildOfficesMigration.ts,
 *     and scripts/seedOffices.ts), so the table and this file cannot drift.
 *   - `A_SAFE_UAE` / `A_SAFE_KSA` are the print-ready views of the two
 *     Middle East records used on PDFs, email footers, drawing title blocks
 *     and shared-document footers.
 *
 * Nothing in client/src or worker should spell out an office address, phone
 * number or contact email literally: shared/offices.guard.test.ts fails the
 * build if one does. Change a value here, then run
 * `npx tsx scripts/buildOfficesMigration.ts` for a new migration file.
 */

export interface OfficeDetails {
  /** Registered legal entity, exactly as the website prints it. */
  legalName: string;
  /** Friendly name used in footers and the office selector. */
  tradingName: string;
  /** Street / building lines followed by "City, Country". */
  addressLines: readonly string[];
  /** `addressLines` joined with ", ". */
  addressOneLine: string;
  city: string;
  country: string;
  /** Phone formatted for display, e.g. "+971 (4) 8842 422". */
  phoneDisplay: string;
  /** Digits only (with country code, no "+"), for tel: / wa.me links. */
  phoneTel: string;
  /** Customer-facing support address printed on address blocks. */
  email: string;
  /** Google Maps short link, or null when the website lists none. */
  mapsUrl: string | null;
}

/** The public website, printed without a scheme on documents. */
export const A_SAFE_WEB = "www.asafe.com";
export const A_SAFE_WEB_URL = "https://www.asafe.com";

/**
 * Internal sales / quotes mailboxes: reply-to targets and order-notification
 * routing. They are not published on asafe.com; the customer-facing address
 * of an office is its record's `email`.
 */
export const SALES_EMAIL = "sales@asafe.ae";
export const QUOTES_EMAIL = "quotes@asafe.ae";
export const SALES_EMAIL_KSA = "sales@asafe.sa";

/** Strip everything but digits from a phone number: "+971 (4) 8842 422" -> "97148842422". */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D+/g, "");
}

/** `tel:` href for a display-formatted phone number. */
export function telHref(phone: string): string {
  return `tel:+${phoneDigits(phone)}`;
}

/** `https://wa.me/<digits>` href for a display-formatted phone number. */
export function whatsAppHref(phone: string): string {
  return `https://wa.me/${phoneDigits(phone)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Every office, as published on asafe.com
// ─────────────────────────────────────────────────────────────────────────

export type OfficeRegion = "Europe" | "International" | "Middle East" | "Americas" | "Asia Pacific";

export interface OfficePhone {
  /** As printed on the page, e.g. "+44 (0)1422 331133". */
  display: string;
  /** E.164 form for `tel:` links, e.g. "+441422331133". */
  tel: string;
}

export interface OfficeRecord {
  /** `global_offices.id`. Fixed: the 17 original rows keep their production ids. */
  id: string;
  /** Legal entity exactly as the website titles the office (`company_name`). */
  legalName: string;
  /** Short friendly name for footers ("A-SAFE UAE"). */
  tradingName: string;
  region: OfficeRegion;
  /** English country name (`global_offices.country`). */
  country: string;
  /** ISO 3166-1 alpha-2, lower case; picks the flag image. */
  countryCode: string;
  city: string;
  /** Street / building lines, at most three (`address_line1..3`). */
  addressLines: readonly string[];
  /** Postcode as the website prints it, with the state where it prints one ("PA 17404"). */
  postalCode: string | null;
  /** The postcode / town line in the country's own order, e.g. "23879 Mölln". */
  cityLine: string;
  /** The address in its original script where the website publishes one (Japan). */
  addressLinesNative?: readonly string[];
  /** Primary phone (`global_offices.phone`); always `phones[0].display`. */
  phoneDisplay: string;
  /** Every published number, primary first. */
  phones: readonly OfficePhone[];
  /** False when the website lists no phone and the number is carried over unverified. */
  phoneVerified: boolean;
  /** WhatsApp number the website publishes for this office's region, if any. */
  whatsApp?: string;
  email: string;
  /** Map pin exactly as the website's contact page carries it. */
  lat: number;
  lng: number;
  /**
   * False where the website's pin is kilometres from the published street
   * address (checked against OpenStreetMap, 2026-11-13). The pin is still
   * stored, but map links use the address instead.
   */
  pinMatchesAddress: boolean;
  /** Google Maps short link, where A-SAFE publishes one. */
  mapsUrl?: string;
  /** Countries whose asafe.com contact page lists this office. */
  servesCountries: readonly string[];
  isHeadOffice: boolean;
  /** `is_default`: the office the selector opens on for its region. */
  isDefault: boolean;
  /** `sort_order` within the region. */
  sortOrder: number;
}

/** WhatsApp number published on the Middle East contact pages (wa.me/+971508842131). */
export const A_SAFE_WHATSAPP_ME = "+971 50 884 2131";
/** `https://wa.me/...` link for the Middle East WhatsApp number. */
export const A_SAFE_WHATSAPP_ME_HREF = whatsAppHref(A_SAFE_WHATSAPP_ME);

function ph(display: string, tel?: string): OfficePhone {
  // "+44 (0)1422 331133" -> "+441422331133": the bracketed trunk zero is not dialled internationally.
  return { display, tel: tel ?? `+${phoneDigits(display.replace("(0)", ""))}` };
}

type OfficeInput = Omit<OfficeRecord, "phoneDisplay" | "phoneVerified" | "pinMatchesAddress" | "isHeadOffice" | "isDefault"> &
  Partial<Pick<OfficeRecord, "phoneVerified" | "pinMatchesAddress" | "isHeadOffice" | "isDefault">>;

function record(o: OfficeInput): OfficeRecord {
  return {
    phoneVerified: true,
    pinMatchesAddress: true,
    isHeadOffice: false,
    isDefault: false,
    ...o,
    phoneDisplay: o.phones[0].display,
  };
}

const UK_ADDRESS = {
  country: "United Kingdom",
  countryCode: "gb",
  city: "Halifax",
  addressLines: ["Habergham Works", "Ainleys Industrial Estate", "Elland"],
  postalCode: "HX5 9JP",
  cityLine: "Halifax, HX5 9JP",
} as const;

export const A_SAFE_OFFICES: readonly OfficeRecord[] = [
  // ── Europe ──
  record({
    id: "98306d62-bf0c-4f8b-9e49-5bfcd3f14f9d",
    legalName: "A-SAFE UK Ltd",
    tradingName: "A-SAFE UK",
    region: "Europe",
    ...UK_ADDRESS,
    phones: [ph("+44 (0)1422 331133")],
    email: "sales@asafe.co.uk",
    lat: 53.6775574,
    lng: -1.8339226,
    servesCountries: ["United Kingdom"],
    isDefault: true,
    sortOrder: 1,
  }),
  record({
    id: "8682998c-0927-4b6e-89d1-00ced940d4bd",
    legalName: "A-SAFE HQ Ltd",
    tradingName: "A-SAFE HQ",
    region: "Europe",
    ...UK_ADDRESS,
    phones: [ph("+44 (0)1422 344402")],
    email: "sales@asafe.co.uk",
    lat: 53.677546,
    lng: -1.833138,
    servesCountries: ["United Kingdom"],
    isHeadOffice: true,
    sortOrder: 2,
  }),
  record({
    id: "fac63ff1-29a9-424a-8e19-43b69bc244c7",
    legalName: "A-SAFE bvba",
    tradingName: "A-SAFE Belgium",
    region: "Europe",
    country: "Belgium",
    countryCode: "be",
    city: "Menen",
    addressLines: ["Krommebeekstraat 56A"],
    postalCode: "8930",
    cityLine: "8930 Menen",
    phones: [ph("+32 (0)5143 3434")],
    email: "customer.service@asafe.be",
    lat: 50.942429,
    lng: 3.142362,
    pinMatchesAddress: false, // pin is ~14 km north of Krommebeekstraat
    servesCountries: ["Belgium", "Luxembourg"],
    sortOrder: 3,
  }),
  record({
    id: "4ef0d760-e0e2-490b-8d89-b705806b1658",
    legalName: "A-SAFE ApS",
    tradingName: "A-SAFE Denmark",
    region: "Europe",
    country: "Denmark",
    countryCode: "dk",
    city: "Taastrup",
    addressLines: ["Rugvænget 46A"],
    postalCode: "2630",
    cityLine: "2630 Taastrup",
    phones: [ph("+45 35145 026")],
    email: "info@asafe.dk",
    lat: 55.65,
    lng: 12.286556,
    servesCountries: ["Denmark"],
    sortOrder: 4,
  }),
  record({
    id: "1830de4e-82e8-4d2a-9f4e-39cc654f0e97",
    legalName: "A-SAFE SAS",
    tradingName: "A-SAFE France",
    region: "Europe",
    country: "France",
    countryCode: "fr",
    city: "Bailly-Romainvilliers",
    addressLines: ["16 Avenue Christian Doppler - Bat. C"],
    postalCode: "77700",
    cityLine: "77700 Bailly-Romainvilliers",
    phones: [ph("+33 1 61 10 78 00")],
    email: "ventes@asafe.fr",
    lat: 48.843227,
    lng: 2.79845,
    servesCountries: ["France", "Switzerland"],
    sortOrder: 5,
  }),
  record({
    id: "40621b01-6f1d-49d3-bd6f-e72efeeb6dd9",
    legalName: "A-SAFE GmbH",
    tradingName: "A-SAFE Germany",
    region: "Europe",
    country: "Germany",
    countryCode: "de",
    city: "Mölln",
    addressLines: ["Sitzkrüger Moor 6"],
    postalCode: "23879",
    cityLine: "23879 Mölln",
    phones: [ph("+49 4542 995 80 40")],
    email: "vertrieb@asafe.de",
    lat: 53.64047,
    lng: 10.695967,
    servesCountries: ["Germany", "Austria", "Switzerland"],
    sortOrder: 6,
  }),
  record({
    id: "ea67fb0c-5a33-4c02-b6ea-535c5849a28f",
    legalName: "A-SAFE Italia s.r.l.",
    tradingName: "A-SAFE Italy",
    region: "Europe",
    country: "Italy",
    countryCode: "it",
    city: "Arcore",
    addressLines: ["Via Felice Matteucci, 19"],
    postalCode: "20862",
    cityLine: "20862 Arcore MB",
    phones: [ph("+39 039 2268044")],
    email: "commerciale@asafe.it",
    lat: 45.633144,
    lng: 9.340101,
    pinMatchesAddress: false, // pin still marks the former Via Grandi office, ~2.8 km away
    servesCountries: ["Italy", "Switzerland"],
    sortOrder: 7,
  }),
  record({
    id: "6eb556aa-208a-4fec-bfdb-95e5dbb114a9",
    legalName: "A-SAFE B.V.",
    tradingName: "A-SAFE Netherlands",
    region: "Europe",
    country: "Netherlands",
    countryCode: "nl",
    city: "Maasdijk",
    addressLines: ["Honderdland 150"],
    postalCode: "2676 LT",
    cityLine: "2676 LT Maasdijk",
    phones: [ph("+31 (0)1746 13120")],
    email: "info@asafe.nl",
    lat: 51.959311,
    lng: 4.214427,
    servesCountries: ["Netherlands"],
    sortOrder: 8,
  }),
  record({
    id: "1f444a10-a934-48f6-8e2f-72ba9c49ee86",
    legalName: "A-SAFE Sp. z o.o.",
    tradingName: "A-SAFE Poland",
    region: "Europe",
    country: "Poland",
    countryCode: "pl",
    city: "Warszawa",
    addressLines: ["Budynek Spaces Platinum (5 piętro)", "ul. Domaniewska 44"],
    postalCode: "02-672",
    cityLine: "02-672 Warszawa",
    // The website prints the international prefix as "00 48"; stored with "+" so tel: links dial.
    phones: [ph("+48 61 250 35 35")],
    email: "polska@asafe.pl",
    lat: 52.1356,
    lng: 21.0204,
    pinMatchesAddress: false, // pin is ~5 km south of ul. Domaniewska 44
    servesCountries: ["Poland"],
    sortOrder: 9,
  }),
  record({
    id: "d065030d-f332-4bf7-90d1-ea7a5c074b51",
    legalName: "A-SAFE Soluciones S.L.",
    tradingName: "A-SAFE Spain",
    region: "Europe",
    country: "Spain",
    countryCode: "es",
    city: "Paterna",
    addressLines: ["C/ Botiguers 5, Edificio Manuel Borso", "Bloque A, oficina 202", "Parque Empresarial Táctica"],
    postalCode: "46980",
    cityLine: "46980 Paterna, Valencia",
    phones: [ph("+34 (96) 111 70 94")],
    email: "ventas@asafe.es",
    lat: 39.512340783519875,
    lng: -0.4502800936849533,
    servesCountries: ["Spain"],
    sortOrder: 10,
  }),
  record({
    id: "0a034388-981b-48cc-9e33-9eacdf0076f3",
    legalName: "A-SAFE AB",
    tradingName: "A-SAFE Sweden",
    region: "Europe",
    country: "Sweden",
    countryCode: "se",
    city: "Kungsbacka",
    addressLines: ["Varlabergsvägen 29"],
    postalCode: "SE-434 39",
    cityLine: "SE-434 39 Kungsbacka",
    phones: [ph("+46 300 77110")],
    email: "info@asafe.se",
    lat: 57.489883,
    lng: 12.05067,
    servesCountries: ["Sweden"],
    sortOrder: 11,
  }),

  // ── International: the contact for countries without an A-SAFE office ──
  record({
    id: "736f69e9-944f-484d-8ce0-e2a5cef14817",
    legalName: "A-SAFE International Ltd",
    tradingName: "A-SAFE International",
    region: "International",
    ...UK_ADDRESS,
    phones: [ph("+44 (0)1422 261661")],
    email: "international@asafe.com",
    lat: 53.6775574,
    lng: -1.8339226,
    // Listed on the UK contact page; it serves every country that has no office of its own.
    servesCountries: [],
    sortOrder: 1,
  }),

  // ── Middle East ──
  record({
    id: "8973dcb6-43f6-42a1-a176-65959b36df40",
    legalName: "A-SAFE DWC-LLC",
    tradingName: "A-SAFE UAE",
    region: "Middle East",
    country: "United Arab Emirates",
    countryCode: "ae",
    city: "Dubai",
    addressLines: ["Office 220, Building A5", "Dubai South Business Park"],
    postalCode: null,
    cityLine: "Dubai",
    phones: [ph("+971 (4) 8842 422")],
    whatsApp: A_SAFE_WHATSAPP_ME,
    email: "support@asafe.ae",
    lat: 25.257961,
    lng: 55.336536,
    pinMatchesAddress: false, // pin is in Deira, ~45 km from Dubai South; mapsUrl is used instead
    mapsUrl: "https://maps.app.goo.gl/55wf4FPkAe2NfKDHA",
    servesCountries: ["United Arab Emirates"],
    isDefault: true,
    sortOrder: 1,
  }),
  record({
    id: "7344ce47-6829-4a3d-9cf3-7bbc26bfe399",
    legalName: "A-SAFE FOR SAFETY COMPANY",
    tradingName: "A-SAFE Saudi Arabia",
    region: "Middle East",
    country: "Saudi Arabia",
    countryCode: "sa",
    city: "Riyadh",
    addressLines: ["Office 10, 6460 Ibrahim Ibn Mukhalad", "Al Malaz District"],
    postalCode: null,
    cityLine: "Riyadh",
    phones: [ph("+966 53 397 0866"), ph("+966 53 035 6116")],
    whatsApp: A_SAFE_WHATSAPP_ME,
    email: "support@asafe.sa",
    lat: 24.668866020044735,
    lng: 46.729094911910714,
    servesCountries: ["Saudi Arabia"],
    sortOrder: 2,
  }),

  // ── Americas ──
  record({
    id: "9e2bed2e-763f-457f-a2c6-bdf3bb95a3e8",
    legalName: "A-SAFE Inc",
    tradingName: "A-SAFE USA",
    region: "Americas",
    country: "United States",
    countryCode: "us",
    city: "York",
    addressLines: ["400 North Zarfoss Drive"],
    postalCode: "PA 17404",
    cityLine: "York, PA 17404",
    phones: [ph("(443) 776 3472", "+14437763472")],
    email: "sales@asafe.us",
    lat: 39.942103,
    lng: -76.79591,
    servesCountries: ["United States"],
    isDefault: true,
    sortOrder: 1,
  }),
  record({
    id: "2d86bbe6-3d3d-44f2-a78f-1b3d35f4028b",
    legalName: "A-SAFE, Sales HQ",
    tradingName: "A-SAFE USA Sales HQ",
    region: "Americas",
    country: "United States",
    countryCode: "us",
    city: "Plano",
    addressLines: ["5801 Headquarters Dr"],
    postalCode: "TX 75024",
    cityLine: "Plano, TX 75024",
    phones: [ph("(443) 776 3472", "+14437763472")],
    email: "sales@asafe.us",
    lat: 33.08490845606752,
    lng: -96.82226103182839,
    servesCountries: ["United States"],
    sortOrder: 2,
  }),
  record({
    id: "b9329b0f-917b-4cf7-9b4c-c9660e0affc0",
    legalName: "A-SAFE Canada",
    tradingName: "A-SAFE Canada",
    region: "Americas",
    country: "Canada",
    countryCode: "ca",
    city: "Stoney Creek",
    addressLines: ["A12-1250 South Service Rd."],
    postalCode: "Ontario L8E 5R9",
    cityLine: "Stoney Creek, Ontario L8E 5R9",
    phones: [ph("+1 647.952.0030")],
    email: "sales@a-safe.ca",
    lat: 43.2187008,
    lng: -79.6477544,
    servesCountries: ["Canada"],
    sortOrder: 3,
  }),
  record({
    id: "01243519-bab1-410d-8728-8bfd74f94432",
    legalName: "A-SAFE S.A. de C.V.",
    tradingName: "A-SAFE Mexico",
    region: "Americas",
    country: "Mexico",
    countryCode: "mx",
    city: "Queretaro",
    addressLines: ["Av. Industria Petroquimica", "435-F Parque Industrial"],
    postalCode: "QRO 76220",
    cityLine: "Queretaro, QRO 76220",
    // The website lists no phone for Mexico. This is the number the app already
    // carried; it is kept because `global_offices.phone` is NOT NULL.
    phones: [ph("+52 (442) 4788987")],
    phoneVerified: false,
    email: "ventas@asafe.mx",
    lat: 20.745667,
    lng: -100.4551,
    servesCountries: ["Mexico"],
    sortOrder: 4,
  }),

  // ── Asia Pacific ──
  record({
    id: "6b9766d9-4c93-4e84-bef3-575f078005ca",
    legalName: "A-SAFE Australasia PTY Ltd",
    tradingName: "A-SAFE Australia",
    region: "Asia Pacific",
    country: "Australia",
    countryCode: "au",
    city: "Eastern Creek",
    addressLines: ["Unit 2, 1-5 Interchange Drive"],
    postalCode: "NSW 2766",
    cityLine: "Eastern Creek, NSW 2766",
    phones: [ph("+61 (0)2962 58927")],
    email: "sales@asafeau.com",
    lat: -33.8059786,
    lng: 150.8458129,
    servesCountries: ["Australia", "New Zealand"],
    isDefault: true,
    sortOrder: 1,
  }),
  record({
    id: "0d960eb1-94ac-4e32-abcd-4a58851b4b64",
    legalName: "A-SAFE K.K. (A-SAFE株式会社)",
    tradingName: "A-SAFE Japan",
    region: "Asia Pacific",
    country: "Japan",
    countryCode: "jp",
    city: "Nara",
    // Romanised for the English UI; the website publishes the Japanese original below.
    addressLines: ["Nara-shi Nijo Ooji Minami 1-2-33", "Rena Shin-Omiya Bldg 2F"],
    postalCode: "630-8012",
    cityLine: "Nara 630-8012",
    addressLinesNative: ["630-8012", "奈良市二条大路南1-2-33", "レナ新大宮ビル2F"],
    // The website prints the national form 0742-32-5180.
    phones: [ph("+81 742-32-5180")],
    email: "info@asafe.jp",
    lat: 34.684547,
    lng: 135.808734,
    servesCountries: ["Japan"],
    sortOrder: 2,
  }),
];

const OFFICE_BY_ID: ReadonlyMap<string, OfficeRecord> = new Map(A_SAFE_OFFICES.map((o) => [o.id, o]));

/** The record behind a `global_offices` row id. */
export function officeById(id: string | null | undefined): OfficeRecord | undefined {
  return id ? OFFICE_BY_ID.get(id) : undefined;
}

function requireOffice(legalName: string): OfficeRecord {
  const found = A_SAFE_OFFICES.find((o) => o.legalName === legalName);
  if (!found) throw new Error(`shared/offices.ts: no office named ${legalName}`);
  return found;
}

export const A_SAFE_UK_RECORD = requireOffice("A-SAFE UK Ltd");
export const A_SAFE_HQ_RECORD = requireOffice("A-SAFE HQ Ltd");
/** The contact for enquiries from countries without an A-SAFE office. */
export const A_SAFE_INTERNATIONAL_RECORD = requireOffice("A-SAFE International Ltd");
export const A_SAFE_US_SALES_HQ_RECORD = requireOffice("A-SAFE, Sales HQ");
export const A_SAFE_UAE_RECORD = requireOffice("A-SAFE DWC-LLC");
export const A_SAFE_KSA_RECORD = requireOffice("A-SAFE FOR SAFETY COMPANY");

/**
 * Offices whose asafe.com contact page covers `country` (English name), the
 * country's own default office first. Falls back to A-SAFE International Ltd
 * when no office lists it, so the result is never empty.
 */
export function officesServingCountry(country: string): OfficeRecord[] {
  const hits = A_SAFE_OFFICES.filter((o) => o.servesCountries.includes(country));
  if (hits.length === 0) return [A_SAFE_INTERNATIONAL_RECORD];
  const rank = (o: OfficeRecord) => (o.country === country ? 0 : 2) + (o.isDefault ? 0 : 1);
  return [...hits].sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder);
}

/** Full postal address, one line per element, ending with the country. */
export function officeAddressLines(o: OfficeRecord): string[] {
  return [...o.addressLines, o.cityLine, o.country];
}

/** Google Maps search link for a free-text query or a "lat,lng" pair. */
export function mapsSearchHref(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Map link for an office: A-SAFE's own short link where one is published,
 * otherwise the website's pin, otherwise (where that pin is known to be off)
 * a search for the published address.
 */
export function officeMapsHref(o: OfficeRecord): string {
  if (o.mapsUrl) return o.mapsUrl;
  if (o.pinMatchesAddress) return mapsSearchHref(`${o.lat},${o.lng}`);
  return mapsSearchHref([o.legalName, ...officeAddressLines(o)].join(", "));
}

/** `tel:` href for a published office phone. */
export function officePhoneHref(p: OfficePhone): string {
  return `tel:${p.tel}`;
}

/** The print-ready view (PDF / email / title-block blocks) of an office record. */
export function officeDetails(o: OfficeRecord): OfficeDetails {
  const addressLines = [...o.addressLines, `${o.cityLine}, ${o.country}`];
  return {
    legalName: o.legalName,
    tradingName: o.tradingName,
    addressLines,
    addressOneLine: addressLines.join(", "),
    city: o.city,
    country: o.country,
    phoneDisplay: o.phoneDisplay,
    phoneTel: phoneDigits(o.phones[0].tel),
    email: o.email,
    mapsUrl: o.mapsUrl ?? null,
  };
}

export const A_SAFE_UAE: OfficeDetails = officeDetails(A_SAFE_UAE_RECORD);
export const A_SAFE_KSA: OfficeDetails = officeDetails(A_SAFE_KSA_RECORD);

/** Second published Riyadh number (the website lists two). */
export const A_SAFE_KSA_PHONE_2 = A_SAFE_KSA_RECORD.phones[1].display;

/**
 * The two Middle East print blocks by `global_offices.country`. For any
 * other office use `officeById` / `officesServingCountry`.
 */
export const OFFICES_BY_COUNTRY: Readonly<Record<string, OfficeDetails>> = {
  [A_SAFE_UAE.country]: A_SAFE_UAE,
  [A_SAFE_KSA.country]: A_SAFE_KSA,
};

// ─────────────────────────────────────────────────────────────────────────
// global_offices rows
// ─────────────────────────────────────────────────────────────────────────

/** Column values for a `global_offices` row (camelCase, as drizzle and the API use them). */
export interface OfficeRowValues {
  id: string;
  companyName: string;
  officeType: "office";
  region: string;
  country: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  postalCode: string | null;
  phone: string;
  email: string;
  imageUrl: string;
  googleMapsUrl: string | null;
  /** decimal(10,8) / decimal(11,8): the website's pin rounded to 8 places. */
  latitude: string;
  longitude: string;
  isActive: true;
  isDefault: boolean;
  sortOrder: number;
}

/** The `global_offices` row an office record is stored as. */
export function officeRowValues(o: OfficeRecord): OfficeRowValues {
  return {
    id: o.id,
    companyName: o.legalName,
    officeType: "office",
    region: o.region,
    country: o.country,
    city: o.city,
    addressLine1: o.addressLines[0],
    addressLine2: o.addressLines[1] ?? null,
    addressLine3: o.addressLines[2] ?? null,
    postalCode: o.postalCode,
    phone: o.phoneDisplay,
    email: o.email,
    imageUrl: `https://flagcdn.com/w80/${o.countryCode}.png`,
    googleMapsUrl: o.mapsUrl ?? null,
    latitude: o.lat.toFixed(8),
    longitude: o.lng.toFixed(8),
    isActive: true,
    isDefault: o.isDefault,
    sortOrder: o.sortOrder,
  };
}

/** The subset of a `global_offices` row (as /api/global-offices returns it) the contact views read. */
export interface OfficeRowLike {
  id: string;
  companyName: string;
  country: string;
  city: string;
  addressLine1: string;
  addressLine2?: string | null;
  addressLine3?: string | null;
  postalCode?: string | null;
  phone: string;
  email: string;
  googleMapsUrl?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

/** Everything a contact card shows for the selected office. */
export interface OfficeContact {
  legalName: string;
  /** Full postal address, one line per element, ending with the country. */
  addressLines: readonly string[];
  addressLinesNative: readonly string[];
  phones: readonly OfficePhone[];
  email: string;
  mapsHref: string;
  /** Display-formatted WhatsApp number, or null when the office publishes none. */
  whatsApp: string | null;
}

function rowMatchesRecord(row: OfficeRowLike, o: OfficeRecord): boolean {
  const v = officeRowValues(o);
  return (
    row.companyName === v.companyName &&
    row.city === v.city &&
    row.addressLine1 === v.addressLine1 &&
    (row.addressLine2 ?? null) === v.addressLine2 &&
    (row.addressLine3 ?? null) === v.addressLine3 &&
    (row.postalCode ?? null) === v.postalCode &&
    row.phone === v.phone &&
    row.email === v.email
  );
}

/**
 * Contact card for a `global_offices` row. The row is what the office
 * selector lists; this adds what the table has no column for (every published
 * phone with its dialable form, the address in the country's own order, the
 * original-script address, WhatsApp). A row an admin has edited away from
 * its record is shown as the row stands.
 */
export function officeContactForRow(row: OfficeRowLike): OfficeContact {
  const rec = officeById(row.id);
  if (rec && rowMatchesRecord(row, rec)) {
    return {
      legalName: rec.legalName,
      addressLines: officeAddressLines(rec),
      addressLinesNative: rec.addressLinesNative ?? [],
      phones: rec.phones,
      email: rec.email,
      mapsHref: row.googleMapsUrl || officeMapsHref(rec),
      whatsApp: rec.whatsApp ?? null,
    };
  }
  const addressLines = [
    row.addressLine1,
    row.addressLine2,
    row.addressLine3,
    [row.city, row.postalCode].filter(Boolean).join(", "),
    row.country,
  ].filter((l): l is string => Boolean(l));
  const hasPin = row.latitude != null && row.longitude != null && row.latitude !== "" && row.longitude !== "";
  const digits = phoneDigits(row.phone.replace("(0)", ""));
  return {
    legalName: row.companyName,
    addressLines,
    addressLinesNative: [],
    phones: [{ display: row.phone, tel: row.phone.trim().startsWith("+") ? `+${digits}` : digits }],
    email: row.email,
    mapsHref:
      row.googleMapsUrl ||
      (hasPin ? mapsSearchHref(`${row.latitude},${row.longitude}`) : mapsSearchHref(addressLines.join(", "))),
    whatsApp: rec?.whatsApp ?? null,
  };
}

export interface OfficeBlockOptions {
  /** Contact email to print instead of the office's support address (e.g. SALES_EMAIL). */
  email?: string;
  /** Print the legal entity instead of the trading name. Default false. */
  legal?: boolean;
  /** Include the website line. Default true. */
  web?: boolean;
}

/**
 * Plain-text office block, one field per line:
 *
 *   A-SAFE UAE
 *   Office 220, Building A5
 *   Dubai South Business Park
 *   Dubai, United Arab Emirates
 *   Tel: +971 (4) 8842 422
 *   support@asafe.ae
 *   www.asafe.com
 */
export function officeBlockText(o: OfficeDetails, opts: OfficeBlockOptions = {}): string {
  const lines = [
    opts.legal ? o.legalName : o.tradingName,
    ...o.addressLines,
    `Tel: ${o.phoneDisplay}`,
    opts.email ?? o.email,
  ];
  if (opts.web !== false) lines.push(A_SAFE_WEB);
  return lines.join("\n");
}

export interface OfficeBlockHtmlOptions extends OfficeBlockOptions {
  /**
   * "stacked" (default): one field per line, separated by <br>.
   * "inline": two lines — name · address / Tel · email · web — for footers.
   */
  layout?: "stacked" | "inline";
  /** Raw HTML placed between inline fields. Default " · ". Not escaped. */
  separator?: string;
  /** Inline style attribute value for the name's <strong>. */
  nameStyle?: string;
  /** Inline style attribute value for the <a> links. */
  linkStyle?: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** HTML office block for email footers and server-rendered pages. Values are escaped. */
export function officeBlockHtml(o: OfficeDetails, opts: OfficeBlockHtmlOptions = {}): string {
  const styleAttr = (s?: string) => (s ? ` style="${escapeHtml(s)}"` : "");
  const name = `<strong${styleAttr(opts.nameStyle)}>${escapeHtml(opts.legal ? o.legalName : o.tradingName)}</strong>`;
  const email = escapeHtml(opts.email ?? o.email);
  const emailLink = `<a href="mailto:${email}"${styleAttr(opts.linkStyle)}>${email}</a>`;
  const webLink = `<a href="${A_SAFE_WEB_URL}"${styleAttr(opts.linkStyle)}>${A_SAFE_WEB}</a>`;
  const tel = `Tel: ${escapeHtml(o.phoneDisplay)}`;
  const contact = [tel, emailLink, ...(opts.web === false ? [] : [webLink])];

  if (opts.layout === "inline") {
    const sep = opts.separator ?? " · ";
    return `${name}${sep}${escapeHtml(o.addressOneLine)}<br>${contact.join(sep)}`;
  }
  return [name, ...o.addressLines.map(escapeHtml), ...contact].join("<br>");
}
