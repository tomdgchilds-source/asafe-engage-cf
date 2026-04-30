import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Trash2, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Camera-first photo capture for surveyors on iPad / Android. Renders a
 * "Capture photo" button that opens the rear camera directly via
 * `<input capture="environment">`, so a surveyor in front of a damaged
 * barrier doesn't have to hunt through their photo library.
 *
 * Photos are converted to base64 data URLs so the form survives offline —
 * the existing ObjectUploader requires a live PUT to R2/KV. When the user
 * is online, the calling page can choose to re-upload these to R2 via the
 * normal flow on save; when offline, the data URLs themselves are
 * persisted in the offline draft and rendered as <img src="data:..."/>.
 *
 * Falls back to a regular file picker on desktop where `capture` is
 * ignored anyway.
 */

export interface CameraPhotoCaptureProps {
  /** Existing photo URLs / data URLs already attached to the area. */
  photos: string[];
  /** Replaces the entire photo list. */
  onChange: (next: string[]) => void;
  /** Maximum total photos for this area (default 8). */
  maxPhotos?: number;
  /** Optional disabled state for completed surveys. */
  disabled?: boolean;
}

export function CameraPhotoCapture({
  photos,
  onChange,
  maxPhotos = 8,
  disabled = false,
}: CameraPhotoCaptureProps) {
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const remaining = Math.max(0, maxPhotos - photos.length);
      const toIngest = Array.from(files).slice(0, remaining);
      const dataUrls = await Promise.all(toIngest.map(fileToDataUrl));
      const next = [...photos, ...dataUrls.filter(Boolean)] as string[];
      onChange(next);
    } finally {
      setBusy(false);
      if (captureInputRef.current) captureInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleRetake = (idx: number) => {
    const next = photos.filter((_, i) => i !== idx);
    onChange(next);
    // The next "Capture" press will append a fresh photo at the end.
    setTimeout(() => captureInputRef.current?.click(), 0);
  };

  const handleRemove = (idx: number) => {
    onChange(photos.filter((_, i) => i !== idx));
  };

  const remaining = Math.max(0, maxPhotos - photos.length);
  const canCapture = !disabled && remaining > 0 && !busy;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          // capture="environment" tells iOS/Android to default to the rear
          // camera. Desktop browsers ignore the attribute. Spread cast through
          // `any` so older @types/react don't reject the prop.
          {...({ capture: 'environment' } as any)}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="input-capture-photo"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="input-gallery-photo"
        />
        <Button
          type="button"
          onClick={() => captureInputRef.current?.click()}
          disabled={!canCapture}
          className="bg-[#FFC72C] hover:bg-[#F0B800] text-black min-h-[44px]"
          data-testid="button-capture-photo"
        >
          <Camera className="h-4 w-4 mr-2" />
          {photos.length === 0 ? 'Take photo' : 'Take another'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => galleryInputRef.current?.click()}
          disabled={!canCapture}
          className="min-h-[44px]"
          data-testid="button-pick-photo"
        >
          <ImageIcon className="h-4 w-4 mr-2" />
          From gallery
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          {photos.length}/{maxPhotos} photos
        </span>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {photos.map((url, idx) => {
            const display = url.startsWith('/objects/') ? url : url;
            return (
              <div
                key={`${idx}-${display.slice(-32)}`}
                className={cn(
                  'relative group aspect-square border rounded overflow-hidden bg-gray-50 dark:bg-gray-800',
                )}
              >
                <img
                  src={display}
                  alt={`Photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {!disabled && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleRetake(idx)}
                      className="text-white text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-white/20"
                      aria-label="Retake photo"
                      data-testid={`button-retake-${idx}`}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      className="text-white text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-red-500/40"
                      aria-label="Delete photo"
                      data-testid={`button-delete-photo-${idx}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  // Resize-on-ingest: a 4032×3024 iPhone JPEG is ~4MB. Surveys easily
  // accumulate 30+ photos, which would blow past localStorage's ~5MB limit
  // and leave the surveyor with nothing to sync. Cap to ~1280px on the long
  // edge and drop quality to 80% — still plenty for visual reference.
  try {
    const resized = await resizeImage(file, 1280, 0.8);
    return resized;
  } catch {
    // Fallback: vanilla data URL.
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
}

function resizeImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('canvas-context-unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image-load-failed'));
    };
    img.src = url;
  });
}

export default CameraPhotoCapture;
