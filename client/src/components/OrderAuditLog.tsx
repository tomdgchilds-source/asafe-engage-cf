import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  History,
  Mail,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  UserPlus,
  Ban,
  RotateCcw,
} from "lucide-react";

/**
 * Audit-log viewer for a single order.
 *
 * Lives on the OrderForm page, collapsed by default so it doesn't eat real
 * estate on the approval screen. Tracks a per-order "last seen" timestamp
 * in localStorage so returning users see an unread badge for any events
 * that happened while they were away.
 *
 * Timestamp format matches the rest of OrderForm.tsx (en-GB locale, 24h),
 * so the timeline visually parallels the approved-by stamps up the page.
 */

export interface AuditEvent {
  id?: string;
  ts: string;
  eventType: string;
  section?: "technical" | "commercial" | "marketing";
  actorName?: string;
  actorEmail?: string;
  nextApproverEmail?: string;
  rejectReason?: string;
  comments?: string;
  /** Any additional backend-provided fields land here for the details row. */
  [key: string]: unknown;
}

function storageKey(orderId: string) {
  return `asafe.auditLog.lastSeen.${orderId}`;
}

function readLastSeen(orderId: string): number {
  try {
    const raw = window.localStorage.getItem(storageKey(orderId));
    return raw ? Number(raw) || 0 : 0;
  } catch {
    // localStorage can throw in private-browsing or sandboxed iframes; we
    // degrade gracefully to "everything is unread" rather than crashing
    // the OrderForm page.
    return 0;
  }
}

function writeLastSeen(orderId: string, ts: number) {
  try {
    window.localStorage.setItem(storageKey(orderId), String(ts));
  } catch {
    // See readLastSeen — non-fatal.
  }
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface EventPresentation {
  label: string;
  tone: "success" | "warning" | "info" | "danger";
  Icon: React.ComponentType<{ className?: string }>;
}

// Central map keeps the UI consistent as the backend adds event types. Any
// unknown eventType falls through to a neutral "info" style.
function presentationFor(eventType: string): EventPresentation {
  switch (eventType) {
    case "approved":
    case "section_approved":
      return { label: "Approved", tone: "success", Icon: CheckCircle2 };
    case "rejected":
    case "section_rejected":
      return { label: "Rejected", tone: "danger", Icon: ShieldAlert };
    case "email_sent":
    case "approval_requested":
      return { label: "Approval email sent", tone: "info", Icon: Mail };
    case "approver_changed":
      return { label: "Approver changed", tone: "info", Icon: UserPlus };
    case "token_revoked":
      return { label: "Link revoked", tone: "warning", Icon: Ban };
    case "token_resent":
      return { label: "Email resent", tone: "info", Icon: RotateCcw };
    default:
      return { label: eventType.replace(/_/g, " "), tone: "info", Icon: Clock };
  }
}

function toneClasses(tone: EventPresentation["tone"]): string {
  switch (tone) {
    case "success":
      return "text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40";
    case "warning":
      return "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40";
    case "danger":
      return "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40";
    default:
      return "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40";
  }
}

export function OrderAuditLog({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(() => readLastSeen(orderId));

  const { data, isLoading, error } = useQuery<AuditEvent[]>({
    queryKey: ["/api/orders", orderId, "audit-log"],
    enabled: !!orderId,
    // Refetch on open so badges stay honest even if the user leaves the
    // collapsible open across a long session. Not aggressive enough to
    // hammer the backend.
    staleTime: 30 * 1000,
  });

  const events = useMemo(() => {
    if (!Array.isArray(data)) return [] as AuditEvent[];
    // Defensive sort — backend says "newest first" but we don't want the UI
    // to break if that ever changes.
    return [...data].sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
    );
  }, [data]);

  const unreadCount = useMemo(() => {
    if (!lastSeen) return events.length;
    return events.filter((e) => new Date(e.ts).getTime() > lastSeen).length;
  }, [events, lastSeen]);

  // When the panel is opened, mark everything current as "seen". We capture
  // the current time (not the newest event ts) so that any in-flight events
  // arriving milliseconds later still show as unread on the next mount.
  useEffect(() => {
    if (open && events.length > 0) {
      const now = Date.now();
      writeLastSeen(orderId, now);
      setLastSeen(now);
    }
  }, [open, events.length, orderId]);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/50 sm:px-6"
            aria-expanded={open}
          >
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-gray-500" />
              <div>
                <p className="font-medium">Approval history</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Every approval, email, and change on this order.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-200"
                >
                  {unreadCount} new
                </Badge>
              )}
              {open ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {isLoading && (
              <p className="py-4 text-sm text-gray-500">Loading history…</p>
            )}
            {error && !isLoading && (
              <p className="py-4 text-sm text-red-600">
                Couldn&apos;t load the approval history. Try again shortly.
              </p>
            )}
            {!isLoading && !error && events.length === 0 && (
              <p className="py-4 text-sm text-gray-500">No events yet.</p>
            )}
            {events.length > 0 && (
              <ol className="relative space-y-4 border-l border-gray-200 pl-5 dark:border-gray-700">
                {events.map((event, idx) => (
                  <AuditEventRow
                    key={event.id || `${event.ts}-${idx}`}
                    event={event}
                  />
                ))}
              </ol>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const { label, tone, Icon } = presentationFor(event.eventType);

  // Details worth surfacing in the expandable row. We iterate over a known
  // allowlist rather than dumping the whole event to avoid leaking internal
  // backend fields (ids, schema versions, etc) into the UI.
  const details: Array<[string, string]> = [];
  if (event.nextApproverEmail) {
    details.push(["Next approver", event.nextApproverEmail]);
  }
  if (event.rejectReason) {
    details.push(["Reason", event.rejectReason]);
  }
  if (event.comments) {
    details.push(["Comments", event.comments]);
  }
  if (event.actorEmail) {
    details.push(["Email", event.actorEmail]);
  }

  return (
    <li className="relative">
      <span
        className={`absolute -left-[29px] flex h-6 w-6 items-center justify-center rounded-full ${toneClasses(
          tone,
        )}`}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {label}
            {event.section ? (
              <span className="ml-2 text-xs font-normal uppercase tracking-wide text-gray-500">
                {event.section}
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-gray-600 dark:text-gray-300">
            {event.actorName || event.actorEmail || "System"}
          </p>
        </div>
        <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
          {formatTs(event.ts)}
        </p>
      </div>
      {details.length > 0 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 h-7 px-2 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400"
          >
            {expanded ? "Hide details" : "Details"}
          </Button>
          {expanded && (
            <dl className="mt-2 space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
              {details.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                  <dt className="w-24 shrink-0 text-gray-500">{k}</dt>
                  <dd className="break-words text-gray-900 dark:text-gray-100">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </li>
  );
}
