import { useState, useEffect, useRef } from "react";

interface UseImageLoaderOptions {
  isOpen: boolean;
  fileUrl?: string;
  isImageFile: boolean;
  isBlankCanvas: boolean;
  /**
   * When true we fetch the PDF with credentials and expose it via a
   * same-origin Blob URL (`pdfBlobUrl`). react-pdf happily fetches that,
   * which sidesteps both the auth-cookie ambiguity AND the "ArrayBuffer
   * is already detached" DataCloneError that occurs when handing it a
   * Uint8Array directly — pdf.js transfers the typed array to its worker,
   * which detaches the backing buffer for any subsequent re-render.
   */
  isPdfFile?: boolean;
}

/**
 * Handles image/blob URL loading, blank canvas generation, and PDF binary
 * fetch. Returns blob URL for images (`imageBlobUrl`), blob URL for PDFs
 * (`pdfBlobUrl`), and a single loading flag that flips false once the
 * active path finished.
 */
export function useImageLoader({ isOpen, fileUrl, isImageFile, isBlankCanvas, isPdfFile }: UseImageLoaderOptions) {
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);
  const imageBlobUrlRef = useRef<string | null>(null);
  const pdfBlobUrlRef = useRef<string | null>(null);

  // Fetch authenticated image and convert to blob URL
  useEffect(() => {
    if (!isOpen || !fileUrl || (!isImageFile && !isBlankCanvas && !isPdfFile)) {
      if (imageBlobUrlRef.current) {
        URL.revokeObjectURL(imageBlobUrlRef.current);
        imageBlobUrlRef.current = null;
      }
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
      setImageBlobUrl(null);
      setPdfBlobUrl(null);
      return;
    }

    // For blank canvas, create a graph paper canvas blob
    if (isBlankCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = 4000; // Large canvas for infinite-like scroll
      canvas.height = 4000;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill with off-white paper background
        ctx.fillStyle = '#fdfdf8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add subtle paper texture with noise
        for (let i = 0; i < 100; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const opacity = Math.random() * 0.02;
          ctx.fillStyle = `rgba(180, 170, 160, ${opacity})`;
          ctx.fillRect(x, y, 1, 1);
        }

        // Draw graph paper grid lines
        const gridSize = 40; // Standard graph paper size
        const majorGridSize = gridSize * 5; // Major grid lines every 5 squares

        // Draw minor grid lines (thin, light blue)
        ctx.strokeStyle = '#d4e4f7';
        ctx.lineWidth = 0.5;

        for (let x = 0; x <= canvas.width; x += gridSize) {
          if (x % majorGridSize !== 0) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
        }

        for (let y = 0; y <= canvas.height; y += gridSize) {
          if (y % majorGridSize !== 0) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
        }

        // Draw major grid lines (thicker, darker blue)
        ctx.strokeStyle = '#a8c5e8';
        ctx.lineWidth = 1;

        for (let x = 0; x <= canvas.width; x += majorGridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }

        for (let y = 0; y <= canvas.height; y += majorGridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }

        // Add margin line (like notebook paper)
        ctx.strokeStyle = '#ffb3ba';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(80, 0);
        ctx.lineTo(80, canvas.height);
        ctx.stroke();

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setImageBlobUrl(url);
            imageBlobUrlRef.current = url;
            setIsImageLoading(false);
          }
        });
      }
      return;
    }

    let cancelled = false;
    setIsImageLoading(true);

    const fetchFile = async () => {
      try {
        // PDFs need raw bytes for react-pdf; images need blob URLs. Both
        // paths share the same credentials-aware fetch so auth-gated
        // /api/objects/* endpoints work identically.
        const response = await fetch(fileUrl, {
          credentials: 'include',
          headers: isPdfFile
            ? { 'Accept': 'application/pdf' }
            : { 'Accept': 'image/*' },
        });

        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.status}`);
        }

        if (isPdfFile) {
          // Blob URL path (NOT a typed array). react-pdf's worker would
          // transfer a Uint8Array — detaching the main-thread buffer — and
          // any subsequent re-render would then fail with DataCloneError.
          // A blob: URL is re-read fresh each time the worker fetches it.
          const blob = await response.blob();
          if (!cancelled) {
            const url = URL.createObjectURL(blob);
            setPdfBlobUrl(url);
            pdfBlobUrlRef.current = url;
            setIsImageLoading(false);
          }
        } else {
          const blob = await response.blob();
          if (!cancelled) {
            const url = URL.createObjectURL(blob);
            setImageBlobUrl(url);
            imageBlobUrlRef.current = url;
            setIsImageLoading(false);
          }
        }
      } catch (error) {
        console.error('Error loading drawing file:', error);
        if (!cancelled) {
          setIsImageLoading(false);
        }
      }
    };

    fetchFile();

    return () => {
      cancelled = true;
      if (imageBlobUrlRef.current) {
        URL.revokeObjectURL(imageBlobUrlRef.current);
        imageBlobUrlRef.current = null;
      }
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
    };
  }, [isOpen, fileUrl, isImageFile, isBlankCanvas, isPdfFile]);

  const cleanup = () => {
    if (imageBlobUrlRef.current) {
      URL.revokeObjectURL(imageBlobUrlRef.current);
      imageBlobUrlRef.current = null;
    }
    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }
    setImageBlobUrl(null);
    setPdfBlobUrl(null);
  };

  return {
    imageBlobUrl,
    pdfBlobUrl,
    isImageLoading,
    setIsImageLoading,
    cleanup,
  };
}
