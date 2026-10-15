// ────────────────────────────────────────────────────────────────────────────
// worker/routes/brand.ts
//
// Public brand endpoints for the customer-facing share pages.
//
//   GET /api/brand/hero?industry=&text=&seed=
//     → { url, caption, client, industry, title }   200
//     → { url: null }                                 404 (no published case
//                                                     study has a photo)
//
// The URL is the case study's own webcdn.asafe.com photograph; nothing is
// proxied or re-hosted. Same picker as the PDF covers (lib/pdf/heroes.ts), so
// the share page and the PDF a customer downloads from it show the same
// reference installation.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { pickHeroUrl } from "../lib/pdf/heroes";

const brand = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_HINT = 200;

function hint(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s.slice(0, MAX_HINT) : null;
}

brand.get("/brand/hero", async (c) => {
  try {
    const pick = await pickHeroUrl(c.env, {
      industry: hint(c.req.query("industry")),
      text: hint(c.req.query("text")),
      seed: hint(c.req.query("seed")),
    });
    if (!pick) {
      return c.json({ url: null }, 404, { "Cache-Control": "public, max-age=300" });
    }
    return c.json(pick, 200, { "Cache-Control": "public, max-age=3600" });
  } catch (error) {
    console.error("Error choosing brand hero:", error);
    return c.json({ url: null }, 500);
  }
});

export default brand;
