import { useEffect, useState } from 'react';
import asafeLogo from '@assets/Square_logo_icon_INSTA_1756494194027.jpg';

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
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center">
      <div className="text-center">
        {/* A-SAFE Logo */}
        <div className="mb-8">
          <img 
            src={asafeLogo} 
            alt="A-SAFE" 
            className="h-24 w-24 mx-auto"
          />
        </div>

        {/* Loading spinner */}
        <div className="mb-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-yellow-500 mx-auto"></div>
        </div>
        
        {/* Slow connection warning */}
        {showSlowWarning && (
          <div className="mt-4 text-sm text-gray-500">
            <p>Taking longer than expected...</p>
            <p className="mt-1">Please check your connection</p>
          </div>
        )}
      </div>
    </div>
  );
}