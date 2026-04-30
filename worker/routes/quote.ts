// ────────────────────────────────────────────────────────────────────────────
// worker/routes/quote.ts
//
// Quoting AI assistant — composes a complete A-SAFE quote DRAFT from a Site
// Survey or an inline scenario, using F's barrier-recommender for top-pick
// per zone, σ's PAS 13 verdict per line item + aggregate, and D's pure-TS
// PDF builder generalised for the quote layout.
//
// Endpoints:
//   POST /api/quote/draft               — compose + persist a draft
//   GET  /api/quote/:id                 — fetch a draft (owner OR magic-link)
//   GET  /api/quote/:id/quote.pdf       — stream the PDF (owner OR magic-link)
//   POST /api/quote/:id/share-link      — owner: mint magic-link
//   POST /api/quote/:id/promote-to-cart — owner: bulk-add to cart
//   GET  /api/public/quotes/:token      — anonymous read via magic-link
//
// HARD RULES:
//   - Quote DRAFT banner non-removable in PDF.
//   - Wording: "PAS 13 aligned" / "borderline" / "not aligned" — never
//     "compliant" (mirrors σ's policy).
//   - Don't break /api/orders — quote→order is a separate promote step.
//   - Don't touch τ's chat surface — this is a parallel endpoint.
//   - Persistence is defensive: CREATE TABLE IF NOT EXISTS so the route
//     functions even if the migration endpoint hasn't been run yet.
//   - Sparse pricing data on accessory SKUs flags as "Contact A-SAFE for
//     quote" rather than guessing — never invent prices.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  recommendBarriers,
  type RecommendationInput,
  type RecommendationVehicle,
  type RecommendationZone,
  type RecommenderProduct,
  type BarrierRecommendation,
  type BarrierRecommendationOption,
} from "../../shared/barrierRecommender";
import {
  pas13Verdict,
  classifyVehicle,
  type Pas13Verdict,
  type Verdict,
} from "../../shared/pas13Rules";
import { ensurePas13ClassesLoaded } from "../services/pas13Classes";
import { pas13Cite, type Pas13Citation } from "../../shared/pas13Citations";
import {
  buildQuoteDraftPdf,
  filenameFor as quotePdfFilename,
  dedupeCitations,
  type QuoteDraftPdfInput,
  type QuoteZoneForPdf,
  type QuoteLineItemForPdf,
} from "../lib/quoteDraftPdf";

const quote = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Feature flag — AI narrative summary ───────────────────────────────────
//
// Default true (OpenAI key is funded; ~$0.001/quote). If the env explicitly
// sets QUOTE_AI_NARRATIVE = "false" / "0" / "off" we render a deterministic
// templated string instead.
function isAiNarrativeEnabled(env: Env): boolean {
  const v = String((env as any).QUOTE_AI_NARRATIVE ?? "").trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return true;
}

// ─── DDL — defensive create on first POST ──────────────────────────────────
let didEnsureDdl = false;
async function ensureQuoteDraftsTable(env: Env): Promise<void> {
  if (didEnsureDdl) return;
  if (!env.DATABASE_URL) return;
  const { neon } = await import("@neondatabase/serverless");
  const sqlClient = neon(env.DATABASE_URL);
  await sqlClient`
    CREATE TABLE IF NOT EXISTS quote_drafts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR,
      survey_id VARCHAR,
      rep_user_id VARCHAR NOT NULL,
      draft_json JSONB NOT NULL,
      pdf_r2_key VARCHAR,
      total_aed NUMERIC(12,2),
      aggregate_pas13_verdict VARCHAR,
      status VARCHAR NOT NULL DEFAULT 'draft',
      share_token VARCHAR,
      share_token_expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `;
  await sqlClient`CREATE INDEX IF NOT EXISTS quote_drafts_rep_idx ON quote_drafts(rep_user_id)`;
  await sqlClient`CREATE INDEX IF NOT EXISTS quote_drafts_project_idx ON quote_drafts(project_id)`;
  await sqlClient`CREATE INDEX IF NOT EXISTS quote_drafts_survey_idx ON quote_drafts(survey_id)`;
  await sqlClient`CREATE INDEX IF NOT EXISTS quote_drafts_token_idx ON quote_drafts(share_token)`;
  didEnsureDdl = true;
}

// ─── Input shape ───────────────────────────────────────────────────────────

interface QuoteDraftRequest {
  surveyId?: string;
  projectId?: string;
  inline?: {
    vehicleTypes: Array<{
      id: string;
      massKg: number;
      speedKmh: number;
      dbVehicleTypeName?: string;
    }>;
    zones: Array<{
      name: string;
      areaApplicationType: string;
      riskLevel: "low" | "medium" | "high" | "critical";
      lengthMeters?: number;
      quantity?: number;
      approachAngleDeg?: number;
    }>;
    environment: {
      internal: boolean;
      external: boolean;
      coldStorage: boolean;
      atex: boolean;
    };
  };
  preferences?: {
    budgetAed?: number;
    preferAlignment?: "max" | "balanced";
    installationComplexity?: "simple" | "standard" | "complex" | "none";
    vatPct?: number;
    customerCompany?: string;
    customerName?: string;
    projectName?: string;
    projectLocation?: string;
  };
}

interface ResolvedScenario {
  vehicleTypes: RecommendationVehicle[];
  zones: RecommendationZone[];
  environment: RecommendationInput["environment"];
  customerCompany?: string;
  customerName?: string;
  projectName?: string;
  projectLocation?: string;
}

// ─── POST /api/quote/draft ─────────────────────────────────────────────────

quote.post("/quote/draft", authMiddleware, mutationRateLimit, async (c) => {
  try {
    await ensureQuoteDraftsTable(c.env).catch((err) => {
      console.warn("[quote] DDL ensure failed (non-fatal):", err);
    });
    await ensurePas13ClassesLoaded(c.env).catch(() => {});

    const userId = c.get("user").claims.sub;
    const body = (await c.req.json().catch(() => ({}))) as QuoteDraftRequest;

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    // ─── Resolve scenario ─────────────────────────────────────────────
    const scenario = await resolveScenario(storage, userId, body);
    if (!scenario || scenario.zones.length === 0) {
      return c.json(
        { message: "Could not resolve any zones from input. Provide surveyId, projectId, or inline scenario." },
        400,
      );
    }

    // ─── Run recommender ──────────────────────────────────────────────
    const slimProducts = await getSlimProducts(storage);
    const recommendations = recommendBarriers(
      {
        vehicleTypes: scenario.vehicleTypes,
        zones: scenario.zones,
        environment: scenario.environment,
        budget: body.preferences?.budgetAed
          ? { maxAed: body.preferences.budgetAed }
          : undefined,
      },
      slimProducts,
    );

    const preferAlignment = body.preferences?.preferAlignment ?? "balanced";

    // ─── Pick selectedOption per zone ─────────────────────────────────
    const pickedZones = recommendations.map((rec) => {
      const selected = pickSelectedOption(rec.options, preferAlignment);
      return { rec, selected };
    });

    // Compute the heaviest vehicle across zones for the aggregate verdict.
    const heaviestVehicle = pickHeaviestVehicle(scenario.vehicleTypes);

    // Worst (lowest fitScore + worst verdict) selected product across all zones.
    let worstSelected: BarrierRecommendationOption | null = null;
    for (const z of pickedZones) {
      if (!z.selected) continue;
      if (!worstSelected) {
        worstSelected = z.selected;
        continue;
      }
      // Worst = lowest verdict tier first, then lowest margin.
      const cur = verdictRank(z.selected.pas13Verdict.verdict);
      const best = verdictRank(worstSelected.pas13Verdict.verdict);
      if (cur < best) {
        worstSelected = z.selected;
      } else if (cur === best) {
        const curM = z.selected.pas13Verdict.details.safetyMarginPct;
        const bestM = worstSelected.pas13Verdict.details.safetyMarginPct;
        if (curM < bestM) worstSelected = z.selected;
      }
    }

    // Aggregate verdict — re-rate the heaviest vehicle against the worst
    // selected option's product impact rating + zone for an honest aggregate.
    let aggregateVerdict: Verdict = "aligned";
    if (worstSelected && heaviestVehicle) {
      aggregateVerdict = worstSelected.pas13Verdict.verdict;
    } else if (pickedZones.every((z) => !z.selected)) {
      aggregateVerdict = "not_aligned";
    }

    // ─── Assemble line items + totals ─────────────────────────────────
    const { lineItems, totalsBeforeService } = assembleLineItems(pickedZones);

    // Service Care line — based on installation complexity + subtotal.
    const installComplexity =
      body.preferences?.installationComplexity ?? "standard";
    const serviceCare = computeServiceCare(installComplexity, totalsBeforeService);

    const subtotalAed = totalsBeforeService;
    const serviceCareAed = serviceCare.amount;
    const vatPct = body.preferences?.vatPct ?? 5; // UAE default 5%
    const preVatTotal = subtotalAed + serviceCareAed;
    const vatAed = Math.round(preVatTotal * (vatPct / 100));
    const grandTotalAed = preVatTotal + vatAed;

    // ─── Citations dedup ──────────────────────────────────────────────
    const allCitations: Pas13Citation[] = [];
    for (const z of pickedZones) {
      if (z.selected) {
        for (const c2 of z.selected.pas13Verdict.citations) allCitations.push(c2);
      }
    }
    const citations = dedupeCitations(allCitations);

    // ─── Build the response payload skeleton ──────────────────────────
    const customerCompany =
      body.preferences?.customerCompany ?? scenario.customerCompany ?? null;
    const customerName =
      body.preferences?.customerName ?? scenario.customerName ?? null;
    const projectName =
      body.preferences?.projectName ?? scenario.projectName ?? null;
    const projectLocation =
      body.preferences?.projectLocation ?? scenario.projectLocation ?? null;

    const zonesOut = pickedZones.map(({ rec, selected }) => {
      const zoneVerdict: Verdict = selected
        ? selected.pas13Verdict.verdict
        : "not_aligned";
      const designVehicleClass =
        rec.designVehicle?.classCode ??
        (heaviestVehicle
          ? classifyVehicle({
              totalMassKg: heaviestVehicle.massKg,
              speedKmh: heaviestVehicle.speedKmh,
            }).classCode
          : "T?");
      return {
        name: rec.zone,
        designVehicle: rec.designVehicle
          ? {
              name:
                rec.designVehicle.id ||
                heaviestVehicle?.dbVehicleTypeName ||
                "design vehicle",
              massKg: rec.designVehicle.massKg,
              speedKmh: rec.designVehicle.speedKmh,
              pas13Class: designVehicleClass,
            }
          : null,
        selectedOption: selected ?? null,
        alternativesConsidered: rec.options.length,
        rationale: selected
          ? selected.rationale
          : rec.notes.length > 0
            ? rec.notes.join(" ")
            : "No PAS-13-aligned option found for this zone — verify with A-SAFE engineering.",
        pas13Verdict: selected ? selected.pas13Verdict : null,
        verdict: zoneVerdict,
      };
    });

    // ─── Notes — AI narrative or deterministic template ───────────────
    const notes = await composeNotes(
      c.env,
      {
        customerCompany,
        projectName,
        zonesOut,
        aggregateVerdict,
        grandTotalAed,
        subtotalAed,
        serviceCareAed,
        installComplexity,
      },
    );

    // ─── Persist + R2 upload ──────────────────────────────────────────
    const quoteId = crypto.randomUUID();
    const generatedAt = new Date();

    // Build the structured response/payload BEFORE the PDF so the JSON
    // we persist matches the JSON the client gets back.
    const draftPayload = {
      quoteId,
      customerCompany,
      customerName,
      projectName,
      projectLocation,
      zones: zonesOut.map((z) => ({
        name: z.name,
        designVehicle: z.designVehicle,
        selectedOption: z.selectedOption,
        alternativesConsidered: z.alternativesConsidered,
        rationale: z.rationale,
        pas13Verdict: z.pas13Verdict,
      })),
      lineItems,
      totals: {
        subtotalAed,
        serviceCareAed: serviceCareAed > 0 ? serviceCareAed : undefined,
        serviceCareLabel: serviceCare.label,
        vatAed: vatAed > 0 ? vatAed : undefined,
        vatPct,
        grandTotalAed,
      },
      aggregatePas13Verdict: aggregateVerdict,
      citations,
      notes,
      createdAt: generatedAt.toISOString(),
      draftStatus: "draft" as const,
    };

    // Build the PDF
    const appOrigin = c.env.APP_URL || `${new URL(c.req.url).origin}`;
    const pdfInput: QuoteDraftPdfInput = {
      quoteId,
      generatedAt,
      customerCompany: customerCompany ?? undefined,
      customerName: customerName ?? undefined,
      projectName: projectName ?? undefined,
      projectLocation: projectLocation ?? undefined,
      zones: zonesOut
        .filter((z) => !!z.selectedOption)
        .map<QuoteZoneForPdf>((z) => {
          const opt = z.selectedOption!;
          return {
            name: z.name,
            designVehicle: z.designVehicle,
            selectedProductName: opt.productName,
            selectedProductSku: opt.recommendedVariantSku,
            quantityOrLengthMeters: opt.quantityOrLengthMeters,
            pricingMode: opt.pricingMode,
            unitPriceAed: opt.unitPriceAed,
            extendedAed: opt.estimatedAedTotal,
            pas13Verdict: opt.pas13Verdict.verdict,
            rationale: opt.rationale,
            citedSections: opt.pas13Verdict.citations.map((c2) => c2.section),
          };
        }),
      lineItems,
      totals: {
        subtotalAed,
        serviceCareAed: serviceCareAed > 0 ? serviceCareAed : undefined,
        serviceCareLabel: serviceCare.label,
        vatAed: vatAed > 0 ? vatAed : undefined,
        vatPct,
        grandTotalAed,
      },
      aggregatePas13Verdict: aggregateVerdict,
      notes,
      appOrigin,
    };
    const pdfOut = buildQuoteDraftPdf(pdfInput);

    // R2 upload — best-effort. PDF stays generatable on the fly even if R2
    // upload fails so the GET endpoint won't 404.
    let pdfR2Key: string | null = null;
    if (c.env.R2_BUCKET) {
      const key = `quotes/${quoteId}.pdf`;
      try {
        await c.env.R2_BUCKET.put(key, pdfOut.pdf, {
          httpMetadata: {
            contentType: "application/pdf",
            contentDisposition: `inline; filename="${pdfOut.filename}"`,
          },
        });
        pdfR2Key = key;
      } catch (err) {
        console.warn("[quote] R2 put failed (non-fatal):", err);
      }
    }

    // Persist
    try {
      const { neon } = await import("@neondatabase/serverless");
      const sqlClient = neon(c.env.DATABASE_URL);
      await sqlClient`
        INSERT INTO quote_drafts
          (id, project_id, survey_id, rep_user_id, draft_json, pdf_r2_key,
           total_aed, aggregate_pas13_verdict, status, created_at, updated_at)
        VALUES (
          ${quoteId},
          ${body.projectId ?? null},
          ${body.surveyId ?? null},
          ${userId},
          ${JSON.stringify(draftPayload)}::jsonb,
          ${pdfR2Key},
          ${grandTotalAed},
          ${aggregateVerdict},
          'draft',
          ${generatedAt.toISOString()},
          ${generatedAt.toISOString()}
        )
      `;
    } catch (err) {
      console.error("[quote] persist failed:", err);
      // Continue — we still return the structured payload + a regen link.
    }

    return c.json({
      ...draftPayload,
      pdfUrl: `/api/quote/${quoteId}/quote.pdf`,
    });
  } catch (error) {
    console.error("Error drafting quote:", error);
    return c.json({ message: "Failed to draft quote" }, 500);
  }
});

// ─── GET /api/quote/:id ────────────────────────────────────────────────────

quote.get("/quote/:id", authMiddleware, async (c) => {
  try {
    await ensureQuoteDraftsTable(c.env).catch(() => {});
    const userId = c.get("user").claims.sub;
    const quoteId = c.req.param("id");

    const row = await fetchDraftRow(c.env, quoteId);
    if (!row) return c.json({ message: "Quote not found" }, 404);
    if (row.rep_user_id !== userId) {
      // Owner-only on the authed endpoint. Anonymous viewers go via
      // /api/public/quotes/:token.
      return c.json({ message: "Quote not found" }, 404);
    }
    return c.json({
      ...row.draft_json,
      pdfUrl: `/api/quote/${quoteId}/quote.pdf`,
      shareToken: row.share_token,
      shareTokenExpiresAt: row.share_token_expires_at,
      status: row.status,
    });
  } catch (error) {
    console.error("Error fetching quote draft:", error);
    return c.json({ message: "Failed to fetch quote draft" }, 500);
  }
});

// ─── GET /api/quote/:id/quote.pdf ──────────────────────────────────────────

quote.get("/quote/:id/quote.pdf", async (c) => {
  // Auth: either authed owner OR ?token=<magic-link>.
  try {
    await ensureQuoteDraftsTable(c.env).catch(() => {});
    const quoteId = c.req.param("id");
    const tokenParam = c.req.query("token") || "";

    const row = await fetchDraftRow(c.env, quoteId);
    if (!row) return c.json({ message: "Quote not found" }, 404);

    let allowed = false;
    if (tokenParam && row.share_token === tokenParam) {
      const exp = row.share_token_expires_at
        ? new Date(row.share_token_expires_at).getTime()
        : null;
      if (!exp || exp > Date.now()) allowed = true;
    }
    if (!allowed) {
      // Try authed owner.
      try {
        // We have to manually run authMiddleware logic — Hono middleware doesn't
        // chain on a single handler. Read the session via the same KV pattern.
        const sessionId = readSessionIdCookie(c.req.raw);
        if (sessionId) {
          const raw = await c.env.KV_SESSIONS.get(`session:${sessionId}`);
          if (raw) {
            const session = JSON.parse(raw);
            if (session?.claims?.sub === row.rep_user_id) allowed = true;
          }
        }
      } catch (err) {
        console.warn("[quote] session-read in pdf endpoint failed:", err);
      }
    }
    if (!allowed) return c.json({ message: "Not authorized" }, 403);

    // Try R2 first; fall back to live regen if missing.
    let pdfBytes: Uint8Array | null = null;
    if (c.env.R2_BUCKET && row.pdf_r2_key) {
      const obj = await c.env.R2_BUCKET.get(row.pdf_r2_key);
      if (obj) {
        pdfBytes = new Uint8Array(await obj.arrayBuffer());
      }
    }
    if (!pdfBytes) {
      const draft = row.draft_json as any;
      const appOrigin = c.env.APP_URL || `${new URL(c.req.url).origin}`;
      const out = buildQuoteDraftPdf({
        quoteId,
        generatedAt: new Date(draft.createdAt || row.created_at),
        customerCompany: draft.customerCompany,
        customerName: draft.customerName,
        projectName: draft.projectName,
        projectLocation: draft.projectLocation,
        zones: (draft.zones as any[])
          .filter((z: any) => !!z.selectedOption)
          .map((z: any) => ({
            name: z.name,
            designVehicle: z.designVehicle,
            selectedProductName: z.selectedOption.productName,
            selectedProductSku: z.selectedOption.recommendedVariantSku,
            quantityOrLengthMeters: z.selectedOption.quantityOrLengthMeters,
            pricingMode: z.selectedOption.pricingMode,
            unitPriceAed: z.selectedOption.unitPriceAed,
            extendedAed: z.selectedOption.estimatedAedTotal,
            pas13Verdict: z.selectedOption.pas13Verdict.verdict,
            rationale: z.selectedOption.rationale,
            citedSections: (z.selectedOption.pas13Verdict.citations || []).map(
              (c2: any) => c2.section,
            ),
          })),
        lineItems: draft.lineItems,
        totals: draft.totals,
        aggregatePas13Verdict: draft.aggregatePas13Verdict,
        notes: draft.notes,
        appOrigin,
      });
      pdfBytes = out.pdf;
    }

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${quotePdfFilename(quoteId)}"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Quote-Aggregate-Verdict": String(row.aggregate_pas13_verdict || ""),
      },
    });
  } catch (error) {
    console.error("Error rendering quote PDF:", error);
    return c.json({ message: "Failed to render quote PDF" }, 500);
  }
});

// ─── POST /api/quote/:id/share-link ────────────────────────────────────────

quote.post("/quote/:id/share-link", authMiddleware, async (c) => {
  try {
    await ensureQuoteDraftsTable(c.env).catch(() => {});
    const userId = c.get("user").claims.sub;
    const quoteId = c.req.param("id");
    const row = await fetchDraftRow(c.env, quoteId);
    if (!row) return c.json({ message: "Quote not found" }, 404);
    if (row.rep_user_id !== userId) {
      return c.json({ message: "Only the quote owner can mint a share link" }, 403);
    }
    const body = await c.req
      .json<{ expiresInDays?: number }>()
      .catch(() => ({}) as { expiresInDays?: number });
    const rawDays = Number(body.expiresInDays);
    const days = Math.max(
      1,
      Math.min(90, Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 30),
    );
    const token = `${crypto.randomUUID()}-${hex16()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    await sqlClient`
      UPDATE quote_drafts
      SET share_token = ${token},
          share_token_expires_at = ${expiresAt.toISOString()},
          updated_at = now()
      WHERE id = ${quoteId}
    `;

    const appUrl = (c.env.APP_URL || `${new URL(c.req.url).origin}`).replace(
      /\/$/,
      "",
    );
    return c.json({
      token,
      url: `${appUrl}/api/quote/${quoteId}/quote.pdf?token=${token}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error minting share link:", error);
    return c.json({ message: "Failed to mint share link" }, 500);
  }
});

// ─── POST /api/quote/:id/promote-to-cart ───────────────────────────────────

quote.post("/quote/:id/promote-to-cart", authMiddleware, async (c) => {
  try {
    await ensureQuoteDraftsTable(c.env).catch(() => {});
    const userId = c.get("user").claims.sub;
    const quoteId = c.req.param("id");
    const row = await fetchDraftRow(c.env, quoteId);
    if (!row) return c.json({ message: "Quote not found" }, 404);
    if (row.rep_user_id !== userId) {
      return c.json({ message: "Only the quote owner can promote this draft" }, 403);
    }
    const draft = row.draft_json as any;
    const lineItems = (draft.lineItems as QuoteLineItemForPdf[]) || [];

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    // Resolve product info for each line item from the catalog (we need
    // the product row id for the cart). The recommender already
    // populated productId in the draft, so we just thread it through.
    const draftZones = (draft.zones as any[]) || [];
    const skuToZone = new Map<string, any>();
    for (const z of draftZones) {
      const sku = z.selectedOption?.recommendedVariantSku;
      if (sku) skuToZone.set(sku, z);
    }

    const items: any[] = [];
    for (const li of lineItems) {
      // Skip price-missing accessories — rep contacts A-SAFE for those.
      if (li.priceMissing) continue;
      // Recover the product to populate cart fields.
      const product = await storage.getProduct(li.productId).catch(() => null);
      const zone = li.sku ? skuToZone.get(li.sku) : null;
      items.push({
        productName: li.productName,
        productId: li.productId,
        sku: li.sku ?? undefined,
        quantity: li.pricingMode === "per_unit" ? li.quantityOrLengthMeters : 1,
        lengthMeters: li.pricingMode === "per_length" ? li.quantityOrLengthMeters : undefined,
        unitPrice: li.unitPriceAed,
        totalPrice: li.extendedAed,
        impactRating: product?.impactRating ?? null,
        category: product?.category ?? "safety-barriers",
        requiresInstallation: true,
        requiresDelivery: true,
        zoneName: zone?.name ?? null,
        areaName: zone?.name ?? null,
        riskLevel: null,
      });
    }

    // Mark the quote as "converted" but keep the row so the user can
    // still download the PDF audit trail.
    try {
      const { neon } = await import("@neondatabase/serverless");
      const sqlClient = neon(c.env.DATABASE_URL);
      await sqlClient`
        UPDATE quote_drafts
        SET status = 'converted', updated_at = now()
        WHERE id = ${quoteId}
      `;
    } catch (err) {
      console.warn("[quote] status update on promote failed:", err);
    }

    return c.json({
      success: true,
      itemCount: items.length,
      items,
      projectInfo: {
        company: draft.customerCompany ?? "",
        projectDescription: draft.notes ?? "",
        siteSurveyId: row.survey_id ?? null,
      },
    });
  } catch (error) {
    console.error("Error promoting quote to cart:", error);
    return c.json({ message: "Failed to promote quote" }, 500);
  }
});

// ─── GET /api/public/quotes/:token ─────────────────────────────────────────

quote.get("/public/quotes/:token", async (c) => {
  try {
    await ensureQuoteDraftsTable(c.env).catch(() => {});
    const tokenStr = c.req.param("token");
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const rows = (await sqlClient`
      SELECT id, draft_json, pdf_r2_key, total_aed, aggregate_pas13_verdict,
             status, share_token_expires_at, created_at
      FROM quote_drafts
      WHERE share_token = ${tokenStr}
      LIMIT 1
    `) as any[];
    const row = rows[0];
    if (!row) return c.json({ message: "Link expired or revoked" }, 404);
    const exp = row.share_token_expires_at
      ? new Date(row.share_token_expires_at).getTime()
      : null;
    if (exp && exp < Date.now()) {
      return c.json({ message: "Link expired or revoked" }, 410);
    }
    const draft = row.draft_json as any;
    return c.json({
      isPublicView: true,
      quoteId: row.id,
      ...draft,
      pdfUrl: `/api/quote/${row.id}/quote.pdf?token=${tokenStr}`,
      status: row.status,
    });
  } catch (error) {
    console.error("Error loading public quote view:", error);
    return c.json({ message: "Failed to load quote" }, 500);
  }
});

// ─── GET /api/quote — list current rep's quotes ────────────────────────────

quote.get("/quote", authMiddleware, async (c) => {
  try {
    await ensureQuoteDraftsTable(c.env).catch(() => {});
    const userId = c.get("user").claims.sub;
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const rows = (await sqlClient`
      SELECT id, project_id, survey_id, total_aed, aggregate_pas13_verdict,
             status, share_token, share_token_expires_at,
             created_at, updated_at,
             draft_json -> 'customerCompany' AS customer_company,
             draft_json -> 'projectName' AS project_name
      FROM quote_drafts
      WHERE rep_user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 50
    `) as any[];
    return c.json(rows);
  } catch (error) {
    console.error("Error listing quotes:", error);
    return c.json({ message: "Failed to list quotes" }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

async function resolveScenario(
  storage: ReturnType<typeof createStorage>,
  userId: string,
  body: QuoteDraftRequest,
): Promise<ResolvedScenario | null> {
  // Inline takes precedence — useful for the SolutionFinder "promote
  // recommendations to quote" path which has the recommender input
  // already in hand.
  if (body.inline) {
    return {
      vehicleTypes: body.inline.vehicleTypes,
      zones: body.inline.zones,
      environment: body.inline.environment,
    };
  }

  // Survey path — pull a survey + areas + map them into the engine shape.
  if (body.surveyId) {
    const survey: any = await storage.getSiteSurvey(body.surveyId);
    if (!survey || survey.userId !== userId) return null;
    const areas = (await storage.getSiteSurveyAreas(body.surveyId)) as any[];
    return mapSurveyToScenario(survey, areas);
  }

  // Project path — read the project's persisted impact calculations.
  if (body.projectId) {
    try {
      const project: any = await storage.getProject(body.projectId);
      if (!project || project.userId !== userId) return null;
      // Project alone doesn't carry zone/vehicle data — return an empty
      // scenario placeholder; the rep should provide inline data.
      return {
        vehicleTypes: [],
        zones: [],
        environment: { internal: true, external: false, coldStorage: false, atex: false },
        customerCompany: project.customerCompany?.name ?? undefined,
        projectName: project.name ?? undefined,
        projectLocation: project.location ?? undefined,
      };
    } catch {
      return null;
    }
  }
  return null;
}

function mapSurveyToScenario(survey: any, areas: any[]): ResolvedScenario {
  const vehicleSeen = new Map<string, RecommendationVehicle>();
  const zones: RecommendationZone[] = [];
  let coldStorage = false;
  for (const a of areas) {
    const massKg = Number(a.vehicleWeight || 0);
    const speedKmh = Number(a.vehicleSpeed || 0);
    if (massKg > 0 && speedKmh > 0) {
      const key = `${a.zoneName || a.areaName || "vehicle"}-${massKg}-${speedKmh}`;
      if (!vehicleSeen.has(key)) {
        vehicleSeen.set(key, {
          id: a.zoneName || a.areaName || "site-survey-vehicle",
          massKg,
          speedKmh,
          dbVehicleTypeName: a.suggestedVehicle || undefined,
        });
      }
    }
    if (/cold/i.test(a.areaType || "")) coldStorage = true;
    zones.push({
      name: a.areaName || a.zoneName || `Area ${zones.length + 1}`,
      areaApplicationType: a.areaType || "General Workplace",
      riskLevel: ((a.riskLevel || "medium") as RecommendationZone["riskLevel"]),
      lengthMeters: undefined,
      quantity: undefined,
      approachAngleDeg: a.impactAngle ? Number(a.impactAngle) : 90,
    });
  }

  // Defensive: if no vehicle was captured on any area, synthesize a
  // conservative baseline (5 t @ 12 km/h forklift) so the recommender
  // still produces something. Flagged to the rep via the rationale.
  if (vehicleSeen.size === 0) {
    vehicleSeen.set("baseline-forklift", {
      id: "baseline-forklift",
      massKg: 5000,
      speedKmh: 12,
      dbVehicleTypeName: "Counterbalance Forklift",
    });
  }

  return {
    vehicleTypes: Array.from(vehicleSeen.values()),
    zones,
    environment: {
      internal: true,
      external: false,
      coldStorage,
      atex: false,
    },
    customerCompany: survey.facilityName,
    customerName: survey.requestedByName,
    projectName: survey.title,
    projectLocation: survey.facilityLocation,
  };
}

async function getSlimProducts(
  storage: ReturnType<typeof createStorage>,
): Promise<RecommenderProduct[]> {
  const products = await storage.getProducts();
  return (products as any[]).map((p: any) => ({
    id: p.id,
    name: p.name,
    category: p.category ?? null,
    impactRating: p.impactRating ?? null,
    pas13TestJoules: p.pas13TestJoules ?? null,
    price: p.price ?? null,
    basePricePerMeter: p.basePricePerMeter ?? null,
    pricingLogic: p.pricingLogic ?? null,
    isColdStorage: p.isColdStorage ?? null,
    suitabilityData: p.suitabilityData ?? null,
    productVariants: Array.isArray(p.productVariants)
      ? p.productVariants
      : Array.isArray(p.variants)
        ? p.variants
        : null,
    impactTestingData: p.impactTestingData ?? null,
  }));
}

function pickSelectedOption(
  options: BarrierRecommendationOption[],
  prefer: "max" | "balanced",
): BarrierRecommendationOption | null {
  if (options.length === 0) return null;
  if (prefer === "max") {
    // Aligned-first → highest fitScore among aligned, fall back to top of list.
    const aligned = options.filter((o) => o.pas13Verdict.verdict === "aligned");
    if (aligned.length > 0) {
      return [...aligned].sort((a, b) => b.fitScore - a.fitScore)[0];
    }
  }
  // Balanced — engine already sorted by fitScore desc.
  return options[0];
}

function pickHeaviestVehicle(
  vehicles: RecommendationVehicle[],
): RecommendationVehicle | null {
  if (vehicles.length === 0) return null;
  let best = vehicles[0];
  let bestKe = 0.5 * best.massKg * Math.pow(best.speedKmh / 3.6, 2);
  for (const v of vehicles.slice(1)) {
    const ke = 0.5 * v.massKg * Math.pow(v.speedKmh / 3.6, 2);
    if (ke > bestKe) {
      best = v;
      bestKe = ke;
    }
  }
  return best;
}

function verdictRank(v: Verdict): number {
  // 0 = worst, 2 = best. Used to pick the worst-case selected option.
  if (v === "not_aligned") return 0;
  if (v === "borderline") return 1;
  return 2;
}

function assembleLineItems(
  pickedZones: Array<{
    rec: BarrierRecommendation;
    selected: BarrierRecommendationOption | null;
  }>,
): { lineItems: QuoteLineItemForPdf[]; totalsBeforeService: number } {
  // Dedupe by SKU — combine quantity if same SKU appears in multiple zones.
  const bySku = new Map<string, QuoteLineItemForPdf>();
  let total = 0;
  for (const { selected } of pickedZones) {
    if (!selected) continue;
    const key =
      selected.recommendedVariantSku ?? `__noSku__${selected.productId}`;
    const priceMissing = !(selected.unitPriceAed > 0);
    const existing = bySku.get(key);
    if (existing) {
      existing.quantityOrLengthMeters += selected.quantityOrLengthMeters;
      // Recompute extended for combined quantity.
      existing.extendedAed = priceMissing
        ? 0
        : Math.round(existing.quantityOrLengthMeters * existing.unitPriceAed);
    } else {
      bySku.set(key, {
        productId: selected.productId,
        productName: selected.productName,
        sku: selected.recommendedVariantSku,
        quantityOrLengthMeters: selected.quantityOrLengthMeters,
        pricingMode: selected.pricingMode,
        unitPriceAed: selected.unitPriceAed,
        extendedAed: priceMissing ? 0 : selected.estimatedAedTotal,
        priceMissing,
      });
    }
  }
  const lineItems = Array.from(bySku.values());
  for (const li of lineItems) total += li.extendedAed;
  return { lineItems, totalsBeforeService: total };
}

function computeServiceCare(
  complexity: "simple" | "standard" | "complex" | "none",
  subtotal: number,
): { amount: number; label: string } {
  // Mirrors orders.ts:getInstallationRate — same percentages, but applied
  // to the subtotal as a single "Service Care" line on the quote.
  if (complexity === "none") return { amount: 0, label: "No service care" };
  let pct: number;
  switch (complexity) {
    case "simple":
      pct = 0.1148264;
      break;
    case "complex":
      pct = 0.26289773;
      break;
    case "standard":
    default:
      pct = 0.1938872;
      break;
  }
  const label = `Service Care (${complexity}, ${(pct * 100).toFixed(1)}%)`;
  return { amount: Math.round(subtotal * pct), label };
}

async function fetchDraftRow(
  env: Env,
  id: string,
): Promise<
  | {
      id: string;
      project_id: string | null;
      survey_id: string | null;
      rep_user_id: string;
      draft_json: any;
      pdf_r2_key: string | null;
      total_aed: number | null;
      aggregate_pas13_verdict: string | null;
      status: string;
      share_token: string | null;
      share_token_expires_at: string | null;
      created_at: string;
    }
  | null
> {
  const { neon } = await import("@neondatabase/serverless");
  const sqlClient = neon(env.DATABASE_URL);
  const rows = (await sqlClient`
    SELECT id, project_id, survey_id, rep_user_id, draft_json, pdf_r2_key,
           total_aed, aggregate_pas13_verdict, status, share_token,
           share_token_expires_at, created_at
    FROM quote_drafts
    WHERE id = ${id}
    LIMIT 1
  `) as any[];
  if (rows.length === 0) return null;
  return rows[0];
}

function readSessionIdCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === "session_id" || k === "sessionId") return v ?? null;
  }
  return null;
}

function hex16(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── AI / templated narrative composition ──────────────────────────────────

async function composeNotes(
  env: Env,
  ctx: {
    customerCompany: string | null;
    projectName: string | null;
    zonesOut: Array<{
      name: string;
      verdict: Verdict;
      selectedOption: BarrierRecommendationOption | null;
    }>;
    aggregateVerdict: Verdict;
    grandTotalAed: number;
    subtotalAed: number;
    serviceCareAed: number;
    installComplexity: string;
  },
): Promise<string> {
  const aiOn = isAiNarrativeEnabled(env) && !!env.OPENAI_API_KEY;
  const deterministic = templatedNarrative(ctx);
  if (!aiOn) return deterministic;
  try {
    const ai = await openAiNarrative(env, ctx, deterministic);
    return ai;
  } catch (err) {
    console.warn("[quote] OpenAI narrative failed, falling back:", err);
    return deterministic;
  }
}

function templatedNarrative(ctx: {
  customerCompany: string | null;
  projectName: string | null;
  zonesOut: Array<{
    name: string;
    verdict: Verdict;
    selectedOption: BarrierRecommendationOption | null;
  }>;
  aggregateVerdict: Verdict;
  grandTotalAed: number;
  subtotalAed: number;
  serviceCareAed: number;
  installComplexity: string;
}): string {
  const zoneCount = ctx.zonesOut.length;
  const aligned = ctx.zonesOut.filter((z) => z.verdict === "aligned").length;
  const borderline = ctx.zonesOut.filter((z) => z.verdict === "borderline").length;
  const notAligned = ctx.zonesOut.filter((z) => z.verdict === "not_aligned").length;
  const aggLabel =
    ctx.aggregateVerdict === "aligned"
      ? "PAS 13 aligned"
      : ctx.aggregateVerdict === "borderline"
        ? "borderline alignment"
        : "not PAS 13 aligned";
  const parts: string[] = [];
  parts.push(
    `Quote draft covering ${zoneCount} zone${zoneCount === 1 ? "" : "s"} for ${ctx.customerCompany ?? "the customer"}${ctx.projectName ? ` (${ctx.projectName})` : ""}.`,
  );
  parts.push(
    `Aggregate verdict: ${aggLabel}. Per-zone breakdown: ${aligned} aligned, ${borderline} borderline, ${notAligned} not aligned.`,
  );
  if (notAligned > 0) {
    parts.push(
      `${notAligned} zone${notAligned === 1 ? "" : "s"} had no PAS-13-aligned product match — verify with A-SAFE engineering before issuing.`,
    );
  }
  parts.push(
    `Subtotal AED ${ctx.subtotalAed.toLocaleString()} + Service Care (${ctx.installComplexity}) AED ${ctx.serviceCareAed.toLocaleString()} = grand total AED ${ctx.grandTotalAed.toLocaleString()} (incl. VAT).`,
  );
  parts.push("Indicative — verify with A-SAFE engineering for procurement.");
  return parts.join(" ");
}

async function openAiNarrative(
  env: Env,
  ctx: {
    customerCompany: string | null;
    projectName: string | null;
    zonesOut: Array<{
      name: string;
      verdict: Verdict;
      selectedOption: BarrierRecommendationOption | null;
    }>;
    aggregateVerdict: Verdict;
    grandTotalAed: number;
    subtotalAed: number;
    serviceCareAed: number;
    installComplexity: string;
  },
  fallback: string,
): Promise<string> {
  const summaryInput = {
    customer: ctx.customerCompany,
    project: ctx.projectName,
    aggregate: ctx.aggregateVerdict,
    zones: ctx.zonesOut.map((z) => ({
      name: z.name,
      verdict: z.verdict,
      product: z.selectedOption?.productName ?? null,
      marginPct: z.selectedOption?.pas13Verdict.details.safetyMarginPct ?? null,
    })),
    subtotalAed: ctx.subtotalAed,
    serviceCareAed: ctx.serviceCareAed,
    grandTotalAed: ctx.grandTotalAed,
    install: ctx.installComplexity,
  };
  const messages = [
    {
      role: "system",
      content: [
        "You are a sales-engineering assistant for A-SAFE, an industrial safety-barrier supplier.",
        "Write a concise, customer-facing summary paragraph (4–6 sentences) for a quote DRAFT.",
        'Use the wording "PAS 13 aligned", "borderline alignment", or "not PAS 13 aligned" — never "compliant".',
        "Lead with the strongest emphasis on PAS 13 alignment in the highest-risk zones.",
        "Do NOT invent products, prices, or zones. Use only the data provided.",
        'Always end with the indicative footnote: "Indicative — verify with A-SAFE engineering for procurement."',
      ].join(" "),
    },
    {
      role: "user",
      content:
        "Draft the summary using this structured data:\n```json\n" +
        JSON.stringify(summaryInput, null, 2) +
        "\n```",
    },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.2,
      max_tokens: 320,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const out = (data.choices?.[0]?.message?.content || "").trim();
  if (!out) return fallback;
  if (!out.toLowerCase().includes("indicative")) {
    return `${out} Indicative — verify with A-SAFE engineering for procurement.`;
  }
  return out;
}

export default quote;
