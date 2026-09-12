import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFArray, PDFRawStream, PDFName, type PDFRef } from "pdf-lib";
import type { Env } from "../../../types";
import { decodeBase64 } from "../assets";
import { SAMPLE_PHOTO_JPEG_B64 } from "../samplePhoto";
import { renderInstallationVerification, STANDARD_CHECKLIST, checkLabel, checkTone, type VerificationInput } from "./installationVerification";

const OUT = "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad/installation-verification.pdf";
const env = {} as Env;

const ONE_PX_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64",
  ),
);

async function containsText(bytes: Uint8Array, s: string): Promise<boolean> {
  const hex = Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toLowerCase();
  const pdf = await PDFDocument.load(bytes);
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : [contents as unknown as PDFRef];
    for (const ref of refs) {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const filter = stream.dict.get(PDFName.of("Filter"));
      const text = filter ? inflateSync(stream.contents).toString("latin1") : Buffer.from(stream.contents).toString("latin1");
      if (text.toLowerCase().includes(hex)) return true;
    }
  }
  return false;
}

function fixture(): VerificationInput {
  const photo = decodeBase64(SAMPLE_PHOTO_JPEG_B64);
  return {
    issuedOn: new Date("2026-09-12T08:00:00Z"),
    installation: {
      title: "Warehouse 4 impact protection",
      customerName: "Gulf Freight Logistics LLC",
      location: "Warehouse 4, Al Quoz Industrial Area 3, Dubai",
      contactName: "Amira Khalil",
      complexity: "standard",
      status: "completed",
      progress: 100,
      plannedStart: new Date("2026-08-20"),
      plannedEnd: new Date("2026-09-08"),
      actualStart: new Date("2026-08-22"),
      actualEnd: new Date("2026-09-10"),
    },
    order: { orderNumber: "ASU-2026-0417", projectName: "Warehouse 4 impact protection" },
    phases: [
      { name: "Site Survey", status: "completed", startDate: new Date("2026-08-20"), endDate: new Date("2026-08-25"), progress: 100, team: "Gulf Install Crew A" },
      { name: "Delivery Scheduling", status: "completed", startDate: new Date("2026-08-25"), endDate: new Date("2026-08-30"), progress: 100 },
      { name: "Installation", status: "completed", startDate: new Date("2026-08-30"), endDate: new Date("2026-09-04"), progress: 100, team: "Gulf Install Crew A" },
      { name: "Commissioning", status: "completed", startDate: new Date("2026-09-04"), endDate: new Date("2026-09-06"), progress: 100 },
      { name: "Handover", status: "completed", startDate: new Date("2026-09-06"), endDate: new Date("2026-09-07"), progress: 100 },
      { name: "Sign-off", status: "delayed", startDate: new Date("2026-09-07"), endDate: new Date("2026-09-08"), progress: 50 },
    ],
    zones: [
      {
        name: "Aisle 4 rack ends",
        location: "Ambient warehouse, aisles 2–7",
        products: ["iFlex RackEnd Barrier × 4", "iFlex Double Traffic Barrier+ × 2"],
        proposalPhoto: photo,
        asInstalledPhoto: ONE_PX_JPEG,
        checklist: STANDARD_CHECKLIST.map((item, i) => ({ item, status: i === 2 ? "fail" : "pass", comment: i === 2 ? "Pallet stored inside 250 mm deflection zone" : "" })),
        notes: "Rack end posts set at 2.2 m centres to drawing DWGAE002882 rev 02.",
      },
      {
        name: "Dock 3 pedestrian crossing",
        products: ["iFlex Pedestrian 3 Rail Barrier × 6"],
        proposalPhoto: null,
        asInstalledPhoto: photo,
        checklist: STANDARD_CHECKLIST.map((item, i) => ({ item, status: i === 3 ? "na" : "pass" })),
      },
    ],
    snags: [
      { ref: "S1", zone: "Aisle 4 rack ends", description: "Pallet stored inside deflection zone; client to relocate and re-mark floor", severity: "major", owner: "Client facilities", due: "19 Sep 2026", status: "open" },
      { ref: "S2", zone: "Dock 3 pedestrian crossing", description: "Gate signage missing", severity: "minor", owner: "A-SAFE UAE", due: "15 Sep 2026", status: "closed" },
    ],
    installTeam: "Gulf Install Crew A",
    preparedBy: "Rami Haddad",
    preparedByTitle: "Projects, A-SAFE UAE",
  };
}

describe("renderInstallationVerification", () => {
  it("renders cover, control, zone pages, snag list and sign-off", async () => {
    const started = Date.now();
    const bytes = await renderInstallationVerification(env, fixture());
    const elapsed = Date.now() - started;
    try {
      mkdirSync(OUT.slice(0, OUT.lastIndexOf("/")), { recursive: true });
      writeFileSync(OUT, bytes);
    } catch {
      /* best effort */
    }
    expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    // Cover + control/programme + 2 zones + snags/sign-off.
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(5);
    expect(elapsed).toBeLessThan(4000);
    expect(await containsText(bytes, "SNAG LIST")).toBe(true);
    expect(await containsText(bytes, "HANDOVER SIGN-OFF")).toBe(true);
    expect(await containsText(bytes, "Verification checklist")).toBe(true);
    expect(await containsText(bytes, "ASU-IV-2609-0417")).toBe(true);
  });

  it("renders with no zones, no snags and no photos", async () => {
    const f = fixture();
    const bytes = await renderInstallationVerification(env, { ...f, zones: [], snags: [], status: "DRAFT" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(await containsText(bytes, "No snags were recorded")).toBe(true);
  });

  it("maps check statuses to labels and tones", () => {
    expect(checkLabel("pass")).toBe("Pass");
    expect(checkLabel("na")).toBe("N/A");
    expect(checkTone("fail")).toBe("critical");
    expect(STANDARD_CHECKLIST).toHaveLength(5);
  });
});
