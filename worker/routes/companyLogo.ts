import { Hono } from "hono";
import type { Env, Variables } from "../types";

const companyLogo = new Hono<{ Bindings: Env; Variables: Variables }>();

// Clearbit autocomplete is an unauthenticated public endpoint inherited
// from the old Clearbit Connect product. It still serves a ranked list of
// companies ({name, domain}) which is what we want for an in-form
// "suggest a logo" picker. If it's down or empty, we fall back to a
// heuristic domain guess and verify against DDG's favicon service.

type Suggestion = {
  name: string;
  domain: string;
  logoUrl: string;
  source: "clearbit-autocomplete" | "guess";
};

// Clearbit's old logo.clearbit.com CDN was retired after the HubSpot
// acquisition (DNS no longer resolves), so even though their autocomplete
// endpoint still returns a `logo` field pointing there, we can't use it.
// We build our own URL from the returned domain using DuckDuckGo's free
// favicon service, which serves a clean PNG with CORS open.
function logoUrlForDomain(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

async function clearbitSuggest(query: string): Promise<Suggestion[]> {
  const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // 3s is plenty — anything slower and the UI should fall through
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{
      name?: string;
      domain?: string;
    }>;
    return raw
      .filter((r) => r.name && r.domain)
      .map((r) => ({
        name: r.name!,
        domain: r.domain!,
        logoUrl: logoUrlForDomain(r.domain!),
        source: "clearbit-autocomplete" as const,
      }));
  } catch {
    return [];
  }
}

// Domain guesses we can try when Clearbit returns nothing.
// We keep a very small list — the UI stays snappy and false positives are
// harmless (the user just picks "none of these" and types a URL instead).
function guessDomains(query: string): string[] {
  const slug = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();
  if (!slug) return [];
  const collapsed = slug.replace(/\s+/g, "");
  const hyphenated = slug.replace(/\s+/g, "-");
  const out = new Set<string>();
  for (const base of [collapsed, hyphenated]) {
    if (!base) continue;
    out.add(`${base}.com`);
    out.add(`${base}.co`);
    out.add(`${base}.io`);
  }
  return Array.from(out).slice(0, 6);
}

async function verifyDomainLogo(domain: string): Promise<boolean> {
  try {
    const res = await fetch(logoUrlForDomain(domain), {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    // DDG returns a tiny placeholder (~150 bytes) for unknown domains, so
    // require a non-trivial payload to filter those out.
    const len = Number(res.headers.get("content-length") ?? "0");
    return len > 300;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────
// POST /api/company-logo/suggest
// Returns up to ~5 suggestions for a typed company name.
// Public (no auth) — it proxies a public endpoint and leaks nothing.
// ──────────────────────────────────────────────
companyLogo.post("/company-logo/suggest", async (c) => {
  try {
    const body = await c.req.json<{ query?: string }>().catch(() => ({}));
    const query = (body.query ?? "").trim();
    if (query.length < 2) {
      return c.json({ suggestions: [] });
    }

    const clearbit = await clearbitSuggest(query);
    if (clearbit.length > 0) {
      return c.json({ suggestions: clearbit.slice(0, 6) });
    }

    // Fallback: try guessed domains in parallel and keep the ones that
    // resolve to a real favicon.
    const candidates = guessDomains(query);
    const verified = await Promise.all(
      candidates.map(async (domain) => {
        const ok = await verifyDomainLogo(domain);
        return ok
          ? {
              name: query,
              domain,
              logoUrl: logoUrlForDomain(domain),
              source: "guess" as const,
            }
          : null;
      }),
    );

    const fallback = verified.filter(
      (x): x is Suggestion => x !== null,
    );
    return c.json({ suggestions: fallback });
  } catch (error) {
    console.error("Error suggesting company logo:", error);
    return c.json({ suggestions: [] }, 200);
  }
});

// ──────────────────────────────────────────────
// GET /api/company-logo/proxy?url=...
// Bypasses CORS / hotlinking restrictions when the selected logo is
// embedded in a PDF or a canvas draw.
// ──────────────────────────────────────────────
companyLogo.get("/company-logo/proxy", async (c) => {
  try {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ message: "Logo URL is required" }, 400);
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return c.json({ message: "Invalid URL format" }, 400);
    }
    // Only allow http(s) and only well-known logo CDNs — no open SSRF.
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return c.json({ message: "Unsupported protocol" }, 400);
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; A-SAFE Engage/1.0)",
      },
    });

    if (!response.ok) {
      return c.json({ message: "Logo not found" }, 404);
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/") && !contentType.includes("svg")) {
      return c.json({ message: "URL does not point to an image" }, 400);
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Error proxying logo:", error);
    return c.json({ message: "Failed to proxy logo" }, 500);
  }
});

// ──────────────────────────────────────────────
// Back-compat: older code paths still call /search. Return the first
// suggestion in the shape the old client expected.
// ──────────────────────────────────────────────
companyLogo.post("/company-logo/search", async (c) => {
  try {
    const body = await c.req
      .json<{ companyName?: string }>()
      .catch(() => ({}));
    const query = (body.companyName ?? "").trim();
    if (query.length < 2) {
      return c.json({
        success: false,
        message: "Company name must be at least 2 characters",
      });
    }

    const clearbit = await clearbitSuggest(query);
    if (clearbit[0]) {
      return c.json({
        success: true,
        logo: {
          url: clearbit[0].logoUrl,
          source: clearbit[0].source,
          domain: clearbit[0].domain,
        },
      });
    }

    // Last-resort favicon so legacy callers get *something*.
    const fallbackDomain =
      query.toLowerCase().replace(/\s+/g, "") + ".com";
    return c.json({
      success: true,
      logo: {
        url: `https://www.google.com/s2/favicons?domain=${fallbackDomain}&sz=128`,
        source: "google-favicon",
        domain: fallbackDomain,
      },
    });
  } catch (error) {
    console.error("Error searching for company logo:", error);
    return c.json(
      { success: false, message: "Failed to search for company logo" },
      500,
    );
  }
});

export default companyLogo;
