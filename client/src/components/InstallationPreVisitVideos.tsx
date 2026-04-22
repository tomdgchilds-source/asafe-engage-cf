/**
 * InstallationPreVisitVideos — "Watch before site visit" panel on the
 * Installation Timeline drawer. Fetches every Installation Video linked
 * to any product on the installation's underlying order's items[] via
 * GET /api/installations/:id/install-videos and renders a compact horizontal
 * strip of thumbnails that open a YouTube lightbox on click.
 *
 * The data flow:
 *   InstallationTimeline drawer  →  GET /api/installations/:id (existing)
 *                                 →  pulls install + order with items[]
 *   ↓
 *   This component fetches /install-videos/ separately so the main drawer
 *   query stays cheap (install videos aren't always needed, and are a
 *   pure-read side panel the user can ignore).
 *
 * Hides when the install has no linked order, an empty cart, or no
 * products match any video. Non-blocking: the panel renders "loading…"
 * for the brief window it's in-flight and then either shows videos or
 * collapses silently.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Eye, PlayCircle } from "lucide-react";
import type { InstallVideo } from "./ProductInstallVideos";

interface Props {
  installationId: string;
}

async function fetchVideos(installationId: string): Promise<InstallVideo[]> {
  const res = await fetch(
    `/api/installations/${encodeURIComponent(installationId)}/install-videos`,
    { credentials: "include" },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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

export function InstallationPreVisitVideos({ installationId }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["install-videos", "installation", installationId],
    queryFn: () => fetchVideos(installationId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const openVideo = useMemo(
    () => videos.find((v) => v.id === openId) || null,
    [videos, openId],
  );
  const openVideoId = openVideo ? extractVideoId(openVideo) : null;

  if (isLoading) return null;
  if (!videos || videos.length === 0) return null;

  return (
    <Card data-testid="install-prevvisit-videos">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4 text-yellow-600" />
          Watch before site visit
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Installation videos for every product on this job. Tap to preview
          with the install team before kickoff.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {videos.map((v) => (
            <button
              key={v.id}
              onClick={() => setOpenId(v.id)}
              className="group relative text-left rounded overflow-hidden border bg-card hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-yellow-400"
              data-testid={`install-prevvisit-video-${v.id}`}
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20">
                  <div className="rounded-full bg-white/90 p-2">
                    <PlayCircle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </div>
              <div className="p-2">
                <div className="text-[11px] font-medium line-clamp-2 leading-tight">
                  {v.title}
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!openId} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-black">
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
