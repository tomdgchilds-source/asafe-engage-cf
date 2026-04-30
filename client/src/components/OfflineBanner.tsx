import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';

/**
 * Yellow offline banner for the Site Survey page. Pinned to the top of the
 * page when the tablet loses connectivity; flips to a transient "syncing"
 * state for ~3s when it comes back, so the surveyor sees the autosave round
 * trip and not just silence.
 *
 * Driven by the page-level `online` flag from useOnlineStatus and the
 * `syncing` flag from useOfflineSurvey — it's a dumb display, no fetching.
 */
export interface OfflineBannerProps {
  online: boolean;
  syncing?: boolean;
  pendingPushCount?: number;
  onSyncNow?: () => void;
}

export function OfflineBanner({
  online,
  syncing = false,
  pendingPushCount = 0,
  onSyncNow,
}: OfflineBannerProps) {
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(!online);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setShowReconnected(false);
      return;
    }
    if (wasOffline) {
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 4000);
      setWasOffline(false);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline]);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-30 -mx-4 sm:mx-0 px-4 py-2 sm:rounded-md bg-[#FFC72C] text-black border-y sm:border border-yellow-700/30 flex items-center gap-2 text-sm font-medium shadow-sm"
        data-testid="banner-offline"
      >
        <span aria-hidden="true">📵</span>
        <CloudOff className="h-4 w-4" />
        <span className="flex-1">
          Offline mode — your changes are saved locally and will sync when you're back online.
          {pendingPushCount > 0 && (
            <span className="ml-1 font-semibold">
              ({pendingPushCount} change{pendingPushCount === 1 ? '' : 's'} pending)
            </span>
          )}
        </span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-30 -mx-4 sm:mx-0 px-4 py-2 sm:rounded-md bg-blue-50 text-blue-900 border-y sm:border border-blue-200 flex items-center gap-2 text-sm font-medium shadow-sm"
        data-testid="banner-syncing"
      >
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Syncing your changes…</span>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-30 -mx-4 sm:mx-0 px-4 py-2 sm:rounded-md bg-green-50 text-green-900 border-y sm:border border-green-200 flex items-center gap-2 text-sm font-medium shadow-sm"
        data-testid="banner-reconnected"
      >
        <CheckCircle2 className="h-4 w-4" />
        <span className="flex-1">Back online — changes synced.</span>
        {onSyncNow && (
          <button
            type="button"
            onClick={onSyncNow}
            className="text-xs underline underline-offset-2"
          >
            Sync now
          </button>
        )}
      </div>
    );
  }

  return null;
}

export default OfflineBanner;
