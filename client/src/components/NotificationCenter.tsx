import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle,
  ShoppingCart,
  Users,
  Truck,
  XCircle,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

// ──────────────────────────────────────────────
// Notification centre
//
// - Polls /api/notifications every 60s while authenticated.
// - Shows unread count on the bell.
// - Groups entries by day (Today / Yesterday / Earlier).
// - Per-type rendering with sensible click-through destinations, with a
//   best-effort fallback to title + message for unknown types (sibling
//   agent φ1 will ship order_* types without requiring a client update).
// - Optimistic mark-as-read on click.
// - "Mark all read" button.
// - Yellow accent on unread rows, muted on read.
// ──────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
  actionUrl?: string;
  createdAt: string;
}

// Lucide icon per notification type — falls back to Bell.
const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  project_share: Users,
  order_approved: CheckCircle,
  order_delivered: Truck,
  order_installed: Wrench,
  order_cancelled: XCircle,
  order_update: ShoppingCart,
  new_product: Info,
  case_study: Info,
  system_alert: AlertTriangle,
  message: Info,
  quote_update: CheckCircle,
  smart_reorder: Clock,
};

// Which bucket does a given timestamp land in?
function dayBucket(iso: string): "today" | "yesterday" | "earlier" {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const t = d.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfYesterday) return "yesterday";
  return "earlier";
}

// Pick a friendly display title + the URL to navigate to on click. If
// the type is unknown we return the notification's own title + message
// and skip the click-through (best-effort contract with φ1).
function renderNotification(n: Notification): { title: string; body: string; href: string | null } {
  const meta = (n.data ?? {}) as Record<string, any>;
  switch (n.type) {
    case "project_share": {
      const projectName = meta.projectName ?? "a project";
      const role = meta.role ?? "collaborator";
      return {
        title: `Added to ${projectName}`,
        body: `You joined as ${role}.`,
        href: meta.projectId ? `/projects?id=${meta.projectId}` : null,
      };
    }
    case "order_approved":
    case "order_delivered":
    case "order_installed":
    case "order_cancelled": {
      const status = n.type.replace("order_", "");
      const orderLabel =
        meta.orderNumber ?? meta.customOrderNumber ?? (meta.orderId ? `Order ${meta.orderId.slice(0, 8)}` : "Order");
      return {
        title: `${orderLabel} is now ${status}`,
        body: n.message ?? "",
        href: meta.orderId ? `/order-form/${meta.orderId}` : null,
      };
    }
    default:
      // Unknown type — show whatever the server sent verbatim, use
      // actionUrl if available so future types still link through.
      return {
        title: n.title,
        body: n.message,
        href: n.actionUrl ?? null,
      };
  }
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Full list; polled every 60s per spec.
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: isAuthenticated ? 60_000 : false,
    enabled: isAuthenticated,
    retry: false,
  });

  // Unread count drives the bell badge.
  const { data: unreadNotifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications/unread"],
    refetchInterval: isAuthenticated ? 60_000 : false,
    enabled: isAuthenticated,
    retry: false,
  });

  const unreadCount = unreadNotifications.length;

  // Optimistic mark-as-read: flip isRead locally before the PATCH lands
  // so clicks feel instant. Reverts on error.
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to mark notification as read");
      return response.json();
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      const previous = queryClient.getQueryData<Notification[]>(["/api/notifications"]) ?? [];
      queryClient.setQueryData<Notification[]>(["/api/notifications"], (curr) =>
        (curr ?? []).map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      queryClient.setQueryData<Notification[]>(
        ["/api/notifications/unread"],
        (curr) => (curr ?? []).filter((n) => n.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["/api/notifications"], ctx.previous);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/notifications/read-all", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to mark all notifications as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
    },
  });

  // Group by day bucket for section headers.
  const grouped = useMemo(() => {
    const today: Notification[] = [];
    const yesterday: Notification[] = [];
    const earlier: Notification[] = [];
    for (const n of notifications) {
      const bucket = dayBucket(n.createdAt);
      if (bucket === "today") today.push(n);
      else if (bucket === "yesterday") yesterday.push(n);
      else earlier.push(n);
    }
    return { today, yesterday, earlier };
  }, [notifications]);

  const handleClick = (n: Notification) => {
    const { href } = renderNotification(n);
    if (!n.isRead) markAsReadMutation.mutate(n.id);
    if (href) {
      setIsOpen(false);
      setLocation(href);
    }
  };

  const NotificationItem = ({ notification }: { notification: Notification }) => {
    const Icon = typeIcons[notification.type] ?? Bell;
    const { title, body } = renderNotification(notification);
    return (
      <button
        type="button"
        onClick={() => handleClick(notification)}
        className={cn(
          "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 transition-colors",
          "hover:bg-muted/70",
          !notification.isRead
            ? "bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-l-yellow-500"
            : "opacity-80",
        )}
        data-testid={`notification-${notification.id}`}
      >
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
            !notification.isRead
              ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4
              className={cn(
                "text-sm text-gray-900 dark:text-gray-100",
                !notification.isRead ? "font-semibold" : "font-medium",
              )}
            >
              {title}
            </h4>
            {!notification.isRead && (
              <span className="flex-shrink-0 mt-1 h-2 w-2 rounded-full bg-yellow-500" aria-label="unread" />
            )}
          </div>
          {body && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{body}</p>}
          <span className="text-xs text-muted-foreground mt-1 block">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </span>
        </div>
      </button>
    );
  };

  const Section = ({ label, items }: { label: string; items: Notification[] }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-4 pt-3 pb-1 text-xs uppercase tracking-wide text-muted-foreground sticky top-0 bg-background">
          {label}
        </div>
        {items.map((n) => (
          <NotificationItem key={n.id} notification={n} />
        ))}
      </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          data-testid="notification-center-trigger"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              data-testid="notification-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-96 p-0">
        <SheetHeader className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Notifications
            </SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                className="text-sm"
                data-testid="mark-all-read-button"
              >
                <Check className="h-3 w-3 mr-1" /> Mark all read
              </Button>
            )}
          </div>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4" data-testid="no-notifications">
              <Bell className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                No notifications
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                When you receive notifications, they'll appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <Section label="Today" items={grouped.today} />
              <Section label="Yesterday" items={grouped.yesterday} />
              <Section label="Earlier" items={grouped.earlier} />
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
