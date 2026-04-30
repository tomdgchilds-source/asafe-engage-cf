import { useEffect, useState } from 'react';
import { Check, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Saved 3s ago" pill the surveyor sees next to the form title. Re-renders
 * every 10s so the relative time stays roughly accurate without spinning
 * the CPU. Uses the offline-survey hook's status to pick the right
 * icon/colour:
 *   - syncing  → blue spinner
 *   - error    → red
 *   - offline  → grey "saved locally"
 *   - synced   → green tick + relative time
 *   - saving-local → yellow saving indicator
 */

export interface SavedAgoIndicatorProps {
  status: 'idle' | 'saving-local' | 'queued' | 'syncing' | 'synced' | 'error';
  online: boolean;
  /** Last successful save timestamp (ms). */
  lastSavedAt: number | null;
  className?: string;
}

export function SavedAgoIndicator({
  status,
  online,
  lastSavedAt,
  className,
}: SavedAgoIndicatorProps) {
  // Force a re-render every ~10s so "Saved 30s ago" → "Saved 1m ago" without
  // any of the heavier formatDistanceToNow + framer-motion machinery.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (status === 'syncing') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300',
          className,
        )}
        data-testid="saved-indicator-syncing"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing…
      </span>
    );
  }

  if (status === 'saving-local') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-300',
          className,
        )}
        data-testid="saved-indicator-saving"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300',
          className,
        )}
        data-testid="saved-indicator-error"
        aria-live="polite"
      >
        <CloudOff className="h-3.5 w-3.5" />
        Save failed — will retry
      </span>
    );
  }

  if (!online) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300',
          className,
        )}
        data-testid="saved-indicator-offline"
      >
        <CloudOff className="h-3.5 w-3.5" />
        Saved locally
        {lastSavedAt ? ` · ${formatAgo(lastSavedAt)}` : ''}
      </span>
    );
  }

  if (status === 'synced' || status === 'queued') {
    if (!lastSavedAt) return null;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400',
          className,
        )}
        data-testid="saved-indicator-saved"
        aria-live="polite"
      >
        {status === 'synced' ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Cloud className="h-3.5 w-3.5" />
        )}
        Saved {formatAgo(lastSavedAt)}
      </span>
    );
  }

  return null;
}

function formatAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default SavedAgoIndicator;
