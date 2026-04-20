import { useState } from "react";
import type { DrawingPoint } from "../types";

interface UseScaleCalibrationOptions {
  initialScale?: number | null;
  initialIsScaleSet?: boolean;
  initialScaleZoomLevel?: number;
}

/**
 * Manages scale calibration state and calculation logic.
 */
export function useScaleCalibration(options?: UseScaleCalibrationOptions) {
  const [showScaleDialog, setShowScaleDialog] = useState<boolean>(false);
  const [isSettingScale, setIsSettingScale] = useState<boolean>(false);
  const [scaleStartPoint, setScaleStartPoint] = useState<DrawingPoint | null>(null);
  const [scaleEndPoint, setScaleEndPoint] = useState<DrawingPoint | null>(null);
  const [scaleTempEndPoint, setScaleTempEndPoint] = useState<DrawingPoint | null>(null);
  const [actualLength, setActualLength] = useState<string>("");
  const [drawingScale, setDrawingScale] = useState<number | null>(options?.initialScale ?? null);
  const [isScaleSet, setIsScaleSet] = useState<boolean>(options?.initialIsScaleSet ?? false);
  const [scaleZoomLevel, setScaleZoomLevel] = useState<number>(options?.initialScaleZoomLevel ?? 1);

  /**
   * Calculate the scale value from two points and an actual length.
   * Returns pixels per mm.
   */
  const calculateScale = (): { scale: number; scaleLine: any } | null => {
    if (!scaleStartPoint || !scaleEndPoint || !actualLength) return null;

    const dx = scaleEndPoint.x - scaleStartPoint.x;
    const dy = scaleEndPoint.y - scaleStartPoint.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const actualLengthMm = parseFloat(actualLength);

    if (pixelDistance > 0 && actualLengthMm > 0) {
      const scale = pixelDistance / actualLengthMm; // pixels per mm
      return {
        scale,
        scaleLine: {
          start: scaleStartPoint,
          end: scaleEndPoint,
          actualLength: actualLengthMm,
          zoomLevel: scaleZoomLevel
        }
      };
    }

    return null;
  };

  const resetCalibration = () => {
    setScaleStartPoint(null);
    setScaleEndPoint(null);
    setScaleTempEndPoint(null);
    setIsSettingScale(false);
    setActualLength("");
  };

  return {
    showScaleDialog,
    setShowScaleDialog,
    isSettingScale,
    setIsSettingScale,
    scaleStartPoint,
    setScaleStartPoint,
    scaleEndPoint,
    setScaleEndPoint,
    scaleTempEndPoint,
    setScaleTempEndPoint,
    actualLength,
    setActualLength,
    drawingScale,
    setDrawingScale,
    isScaleSet,
    setIsScaleSet,
    scaleZoomLevel,
    setScaleZoomLevel,
    calculateScale,
    resetCalibration,
  };
}
