import { useEffect } from 'react';

export function MobileOptimizer() {
  useEffect(() => {
    // Detect iOS and add class for specific optimizations
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS) {
      document.documentElement.classList.add('ios-device');
    }

    // Prefetch critical resources
    const prefetchLinks = [
      '/api/auth/user',
      '/api/products',
      '/api/cart'
    ];

    prefetchLinks.forEach(link => {
      const linkEl = document.createElement('link');
      linkEl.rel = 'prefetch';
      linkEl.href = link;
      document.head.appendChild(linkEl);
    });

    // Handle viewport height on mobile (fixes iOS Safari issues)
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);

    // Optimize touch events
    if ('ontouchstart' in window) {
      document.addEventListener('touchstart', () => {}, { passive: true });
      document.addEventListener('touchmove', () => {}, { passive: true });
    }

    // Clean up resize listeners
    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('orientationchange', setVH);
    };
  }, []);

  return null;
}