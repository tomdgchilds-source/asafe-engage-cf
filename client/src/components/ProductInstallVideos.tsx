/**
 * ProductInstallVideos — "Installation Videos" panel on the product detail
 * page. Pulls every `Installation Video` resource linked to the current
 * product via GET /api/products/:id/install-videos, renders a responsive
 * grid of thumbnails, and opens a lightbox modal with an autoplayed
 * YouTube iframe when a thumbnail is clicked.
 *
 * Source of truth is the `resources` table (resource_type =
 * 'Installation Video') joined through the `product_resources` m2m. Family-
 * level matches (confidence 0.6 — "iFlex Dock Gate XL" attaching to every
 * gate product) are flagged by the caller via title wording alone; this
 * component doesn't need the confidence because the admin ingest decides
 * which edges to insert. It does render a subtle "covers product family"
 * caption when the resource has no per-product hero — i.e. the title
 * doesn't include the product name. See docs in scripts/scrapePlaylist.ts
 * for the matching rules.
 *
 * Lightbox modal uses Radix Dialog (already in use across the app) and an
 * iframe targeting `https://www.youtube.com/embed/<videoId>?autoplay=1`.
 * The iframe is remounted on open/close so playback fully stops when the
 * modal closes.
 *
 * Renders nothing when the product has no linked videos — avoids flashing
 * an empty panel on products outside A-SAFE's install playlist.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Clock, Youtube } from "lucide-react";

export interface InstallVideo {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  externalUrl: string | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  createdAt: string | null;
}

interface ProductInstallVideosProps {
  productId: string;
  productName: string;
}

async function fetchVideos(productId: string): Promise<InstallVideo[]> {
  const res = await fetch(
    `/api/products/${encodeURIComponent(productId)}/install-videos`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`install-videos ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Parse duration from the resource description when yt-dlp chapter data
// isn't present on the row. We only have `duration` on the scrape file,
// not the resource row — so fall back to a small inline label. Future:
// promote duration to its own column on resources and index here.
function formatDurationLabel(video: InstallVideo): string | null {
  // Some titles hint at duration ("above 2.5m") — not actual runtime.
  // Returning null means the <Clock> line hides. Once we store duration
  // on resources we can surface MM:SS here.
  void video;
  return null;
}

function extractVideoId(v: InstallVideo): string | null {
  if (v.videoId) return v.videoId;
  const url = v.fileUrl || v.externalUrl || "";
  const m1 = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m1) return m1[1];
  const m2 = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m2) return m2[1];
  const m3 = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m3) return m3[1];
  return null;
}

// "Covers this product family" caption heuristic — if the video title
// doesn't literally include the product name, or has generic family
// wording like "High Level" / "Dock Gate" / "Bollard" without size, we
// render the caption so reps don't mistake it for a SKU-specific guide.
function isFamilyCaption(video: InstallVideo, productName: string): boolean {
  const title = (video.title || "").toLowerCase();
  const name = (productName || "").toLowerCase();
  // When the product name is short (<5 chars) the heuristic is unreliable.
  if (name.length < 5) return false;
  // If every core token of the product name is in the title, it's specific.
  const tokens = name
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["the", "and"].includes(t));
  const allInTitle = tokens.every((t) => title.includes(t));
  return !allInTitle;
}

export function ProductInstallVideos({
  productId,
  productName,
}: ProductInstallVideosProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["install-videos", productId],
    queryFn: () => fetchVideos(productId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const openVideo = useMemo(
    () => videos.find((v) => v.id === openId) || null,
    [videos, openId],
  );
  const openVideoId = openVideo ? extractVideoId(openVideo) : null;

  if (isLoading) return null; // quiet while loading — avoid empty-flash
  if (!videos || videos.length === 0) return null;

  return (
    <Card data-testid="product-install-videos-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Youtube className="h-5 w-5 text-red-600" />
          Installation Videos
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Step-by-step fitting guides for {productName}. Click a thumbnail to
          play full-screen without leaving this page.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {videos.map((v) => {
            const familyCaption = isFamilyCaption(v, productName);
            const durationLabel = formatDurationLabel(v);
            return (
              <button
                key={v.id}
                onClick={() => setOpenId(v.id)}
                className="group relative text-left rounded-lg overflow-hidden border bg-card hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-yellow-400"
                data-testid={`install-video-${v.id}`}
              >
                <div className="relative aspect-video bg-muted">
                  {v.thumbnailUrl ? (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                    <div className="rounded-full bg-white/90 p-3 shadow-lg group-hover:scale-110 transition-transform">
                      <PlayCircle className="h-8 w-8 text-red-600" />
                    </div>
                  </div>
                  {durationLabel && (
                    <div className="absolute bottom-1 right-1 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {durationLabel}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium line-clamp-2 leading-snug">
                    {v.title}
                  </h3>
                  {familyCaption ? (
                    <Badge
                      variant="outline"
                      className="mt-2 text-[10px] font-normal text-muted-foreground"
                    >
                      Covers this product family
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="mt-2 text-[10px] font-normal bg-emerald-50 text-emerald-800 border-emerald-200"
                    >
                      Specific to this product
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>

      <Dialog open={!!openId} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black">
          {/* Visually-hidden title for a11y; screen-readers read the video
              title even though the UI focuses the iframe. */}
          <DialogTitle className="sr-only">
            {openVideo?.title || "Installation video"}
          </DialogTitle>
          {openVideoId ? (
            <div className="relative aspect-video w-full">
              <iframe
                key={openVideoId}
                src={`https://www.youtube.com/embed/${openVideoId}?autoplay=1&rel=0`}
                title={openVideo?.title || "Installation video"}
                className="absolute inset-0 w-full h-full"
                frameBorder={0}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="p-8 text-center text-white">Video unavailable</div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
