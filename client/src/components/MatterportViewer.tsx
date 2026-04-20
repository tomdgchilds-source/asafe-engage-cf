import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, Loader2 } from "lucide-react";

interface MatterportViewerProps {
  modelId: string;
  className?: string;
  allowFullScreen?: boolean;
}

// Parse Matterport URL to extract model ID
export function parseMatterportUrl(url: string): string | null {
  if (!url) return null;
  // Direct model ID (no URL)
  if (/^[a-zA-Z0-9]+$/.test(url.trim())) return url.trim();
  // URL format: https://my.matterport.com/show/?m=ABC123
  const match = url.match(/[?&]m=([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function MatterportViewer({ modelId, className = "", allowFullScreen = true }: MatterportViewerProps) {
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullScreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullScreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative rounded-lg overflow-hidden border border-border ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading 3D scan...</span>
        </div>
      )}
      <iframe
        src={`https://my.matterport.com/show/?m=${modelId}&play=1&qs=1`}
        width="100%"
        height="100%"
        style={{ minHeight: isFullScreen ? "100vh" : "400px", border: "none" }}
        allow="fullscreen; xr-spatial-tracking"
        onLoad={() => setLoading(false)}
      />
      {allowFullScreen && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-2 right-2 z-20 shadow-md"
          onClick={toggleFullScreen}
        >
          {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}
