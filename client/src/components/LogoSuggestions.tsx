import { useEffect, useRef, useState } from "react";
import { Building2, Check, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface LogoSuggestion {
  name: string;
  domain: string;
  logoUrl: string;
  source: string;
}

interface LogoSuggestionsProps {
  /** The company name typed by the user — drives auto-search. */
  query: string;
  /** Currently selected logo URL (persisted on the record). */
  value: string | null;
  /** Called with a new URL when the user picks one, or null when cleared. */
  onChange: (logoUrl: string | null) => void;
  /** Optional label override. */
  label?: string;
  className?: string;
}

/**
 * Inline logo picker. As the user types a company name, we debounce and
 * hit Clearbit's autocomplete through our own worker to propose a handful
 * of logos. Clicking one commits the URL via `onChange`; the surrounding
 * form is then responsible for persisting it to the customer record.
 *
 * Design goals:
 *   - Quiet when there's nothing to show (no query / no hits).
 *   - Single tap to accept.
 *   - Always allow a manual URL override, since Clearbit misses SMBs.
 */
export function LogoSuggestions({
  query,
  value,
  onChange,
  label = "Logo",
  className,
}: LogoSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<LogoSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Debounced auto-search. We skip when the record already has a logo
  // chosen — the user isn't trying to replace it unless they hit refresh.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLastQuery("");
      return;
    }
    if (value) return; // don't overwrite an existing pick
    if (trimmed === lastQuery) return;

    const t = window.setTimeout(() => {
      void runSearch(trimmed);
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, value]);

  const runSearch = async (q: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await apiRequest("/api/company-logo/suggest", "POST", {
        query: q,
      });
      if (ctrl.signal.aborted) return;
      const data = (await res.json()) as { suggestions?: LogoSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      setLastQuery(q);
    } catch {
      if (!ctrl.signal.aborted) setSuggestions([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    const url = manualUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      return;
    }
    onChange(url);
    setManualUrl("");
    setManualOpen(false);
  };

  const showRefresh = query.trim().length >= 2;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          {showRefresh && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => runSearch(query.trim())}
              disabled={loading}
              data-testid="button-logo-refresh"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span className="ml-1">Refresh</span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={() => setManualOpen((v) => !v)}
            data-testid="button-logo-manual"
          >
            Paste URL
          </Button>
        </div>
      </div>

      {/* Selected logo preview */}
      {value && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
          <LogoThumb url={value} size={40} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground truncate">
              Selected logo
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {value}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onChange(null)}
            data-testid="button-logo-clear"
            aria-label="Clear logo"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Suggestion grid */}
      {!value && suggestions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {suggestions.map((s) => (
            <button
              type="button"
              key={`${s.domain}-${s.logoUrl}`}
              onClick={() => onChange(s.logoUrl)}
              className={cn(
                "flex items-center gap-2 rounded-md border border-border bg-card",
                "hover:border-[#FFC72C] hover:bg-[#FFC72C]/5 transition-colors",
                "p-2 text-left min-h-[52px]",
              )}
              data-testid={`logo-suggestion-${s.domain}`}
            >
              <LogoThumb url={s.logoUrl} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">
                  {s.name}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {s.domain}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty states */}
      {!value && !loading && suggestions.length === 0 && lastQuery && (
        <p className="text-[11px] text-muted-foreground">
          No logo matches for "{lastQuery}". Use Paste URL to set one manually.
        </p>
      )}

      {/* Manual URL override */}
      {manualOpen && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            className="h-8 text-xs"
            data-testid="input-logo-manual-url"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleManualSubmit}
            disabled={!manualUrl.trim()}
            className="h-8 bg-[#FFC72C] text-black hover:bg-[#FFB700]"
            data-testid="button-logo-manual-save"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function LogoThumb({ url, size }: { url: string; size: number }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [url]);
  if (errored) {
    return (
      <div
        style={{ height: size, width: size }}
        className="rounded bg-muted flex items-center justify-center flex-shrink-0"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      style={{ height: size, width: size }}
      className="rounded object-contain bg-white border border-border flex-shrink-0"
      onError={() => setErrored(true)}
    />
  );
}
