import { useEffect, useRef } from "react";

interface TurnstileProps {
  siteKey: string;
  onToken: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
  action?: string;
}

// Cloudflare Turnstile challenge widget.
//
// Loads the Turnstile bootstrap script once, then renders the challenge
// in a provided container div via the explicit-render API (so we can
// mount/unmount cleanly inside React). onToken fires with the token on
// success, or null on expiry / failure so the parent can disable the
// submit button until the challenge is resolved again.
//
// If `siteKey` is empty/null (e.g. TURNSTILE_SITE_KEY is unset), the
// component renders nothing — the parent form should skip requiring a
// token in that case.
export function Turnstile({ siteKey, onToken, theme = "auto", action }: TurnstileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    const SCRIPT_ID = "cf-turnstile-bootstrap";
    const mount = () => {
      if (!ref.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts = (window as any).turnstile;
      if (!ts) return;
      widgetIdRef.current = ts.render(ref.current, {
        sitekey: siteKey,
        theme,
        action,
        callback: (token: string) => onToken(token),
        "error-callback": () => onToken(null),
        "expired-callback": () => onToken(null),
      });
    };

    let pollId: ReturnType<typeof setInterval> | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).turnstile) {
      mount();
    } else if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
      s.async = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onTurnstileLoad = mount;
      document.head.appendChild(s);
    } else {
      // Script loading, poll until ready
      pollId = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).turnstile) {
          if (pollId) clearInterval(pollId);
          mount();
        }
      }, 100);
    }

    return () => {
      if (pollId) clearInterval(pollId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ts = (window as any).turnstile;
      if (widgetIdRef.current && ts) {
        try {
          ts.remove(widgetIdRef.current);
        } catch {
          // noop — widget may already be gone
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, action, onToken]);

  if (!siteKey) return null;
  return <div ref={ref} />;
}
