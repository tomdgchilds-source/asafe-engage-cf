import { useEffect, useState } from "react";
import { BrandedSpinner } from "@/components/BrandedSpinner";

export function MobileLoadingScreen() {
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  useEffect(() => {
    // Show slow connection warning after 3 seconds
    const timer = setTimeout(() => {
      setShowSlowWarning(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-background text-foreground z-50 flex flex-col items-center justify-center">
      <BrandedSpinner size="xl" />

      {/* Slow connection warning */}
      {showSlowWarning && (
        <div className="mt-6 text-sm text-muted-foreground text-center">
          <p>Taking longer than expected…</p>
          <p className="mt-1">Please check your connection</p>
        </div>
      )}
    </div>
  );
}
