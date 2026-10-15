// ────────────────────────────────────────────────────────────────────────────
// DocHeroStrip — a real A-SAFE reference installation under the black header
// band of the customer-facing document pages (SharedProjectView,
// SharedOrderView, ApprovalLanding).
//
// The photo comes from GET /api/brand/hero, which returns a published case
// study's own webcdn.asafe.com photograph chosen for the customer's industry
// and the page's text hints — the same picker the PDF covers use, so the
// page and the downloaded PDF agree. The caption names the client and
// industry so nobody reads it as their own site. Nothing is rendered until
// the picker answers, and nothing at all when it has no photo.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export interface DocHeroStripProps {
  /** Customer industry as the app stores it, when known. */
  industry?: string | null;
  /** Free text with industry signals (customer name, project name, location). */
  text?: string | null;
  /** Stable tie-break (share token, order number) so the same page keeps the same photo. */
  seed?: string | null;
}

interface HeroResponse {
  url: string | null;
  caption?: string;
  client?: string;
  industry?: string;
  title?: string;
}

export default function DocHeroStrip({ industry, text, seed }: DocHeroStripProps) {
  const [hero, setHero] = useState<HeroResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (industry) params.set("industry", industry.slice(0, 200));
    if (text) params.set("text", text.slice(0, 200));
    if (seed) params.set("seed", seed.slice(0, 200));
    fetch(`/api/brand/hero?${params.toString()}`, { credentials: "omit", headers: { Accept: "application/json" } })
      .then(async (res) => (res.ok ? ((await res.json()) as HeroResponse) : null))
      .then((body) => {
        if (!cancelled) setHero(body && body.url ? body : null);
      })
      .catch(() => {
        if (!cancelled) setHero(null);
      });
    return () => {
      cancelled = true;
    };
  }, [industry, text, seed]);

  if (!hero?.url) return null;
  const caption = hero.caption ?? "A-SAFE reference installation";
  return (
    <figure className="doc-hero" data-testid="document-hero">
      <img className="doc-hero__img" src={hero.url} alt={hero.title ? `${caption} — ${hero.title}` : caption} loading="lazy" />
      <figcaption className="doc-hero__caption">
        <span className="doc-hero__label">Reference photograph</span>
        {caption}. Not this site.
      </figcaption>
    </figure>
  );
}
