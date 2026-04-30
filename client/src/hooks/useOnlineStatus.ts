import { useEffect, useState } from 'react';

/**
 * Page-wide online/offline subscription. The Site Survey page hangs an
 * "📵 Offline" banner off of this whenever the surveyor's tablet drops 4G
 * inside a steel-clad warehouse. Returns `true` on the server / before
 * hydration to avoid a nasty SSR flash.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);

  return online;
}

export default useOnlineStatus;
