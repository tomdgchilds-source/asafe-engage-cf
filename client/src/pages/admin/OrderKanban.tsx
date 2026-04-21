import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ──────────────────────────────────────────────
// Admin Order Kanban — /admin/orders
// Fetches the 9-bucket payload from GET /api/admin/orders/kanban.
// Each column renders cards with inline status change via PATCH.
// Auth gate is handled by <AdminRoute> in App.tsx.
// ──────────────────────────────────────────────

const LIFECYCLE_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "in_production",
  "delivered",
  "installed",
  "invoiced",
  "paid",
  "cancelled",
] as const;

type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

interface OrderSummary {
  id: string;
  orderNumber: string;
  customOrderNumber: string | null;
  customerCompany: string | null;
  customerName: string | null;
  grandTotal: string | null;
  currency: string;
  status: string;
  statusChangedAt: string | null;
  createdAt: string | null;
}

type KanbanPayload = Record<string, OrderSummary[]>;

// Column accent colours — kept in sync with the status pill on OrderForm so
// the board, the pill, and the PDF all speak the same visual language.
const STATUS_STYLE: Record<LifecycleStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-300",
  submitted: "bg-blue-100 text-blue-800 border-blue-300",
  approved: "bg-yellow-100 text-yellow-900 border-yellow-300",
  in_production: "bg-amber-100 text-amber-900 border-amber-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  installed: "bg-green-200 text-green-900 border-green-400",
  invoiced: "bg-purple-100 text-purple-800 border-purple-300",
  paid: "bg-teal-100 text-teal-800 border-teal-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const STATUS_LABEL: Record<LifecycleStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  in_production: "In production",
  delivered: "Delivered",
  installed: "Installed",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
};

// Days-since formatter — small, self-contained so we don't depend on
// date-fns here (smaller bundle, one page means one utility).
function daysSince(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatTotal(value: string | null, currency: string): string {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return `${currency} ${value}`;
  return `${currency} ${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrderKanban() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useQuery<KanbanPayload>({
    queryKey: ["/api/admin/orders/kanban"],
    queryFn: getQueryFn({ on401: "returnNull" }) as any,
  });

  const statusMutation = useMutation({
    mutationFn: async (vars: { id: string; status: LifecycleStatus }) => {
      const res = await apiRequest(`/api/orders/${vars.id}/status`, "PATCH", {
        status: vars.status,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/orders/kanban"] });
    },
    onError: (err: any) => {
      toast({
        title: "Status update failed",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const columns = useMemo(() => {
    const src = data || ({} as KanbanPayload);
    return LIFECYCLE_STATUSES.map((s) => ({ status: s, items: src[s] || [] }));
  }, [data]);

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading kanban…</div>;
  }
  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load kanban: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Order Kanban</h1>
        <div className="text-sm text-gray-500">
          {columns.reduce((sum, col) => sum + col.items.length, 0)} orders
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(({ status, items }) => (
          <div
            key={status}
            className="min-w-[280px] max-w-[320px] flex-shrink-0 bg-gray-50 rounded-lg p-3"
            data-testid={`kanban-col-${status}`}
          >
            <div className="flex items-center justify-between mb-3">
              <Badge variant="outline" className={STATUS_STYLE[status]}>
                {STATUS_LABEL[status]}
              </Badge>
              <span className="text-xs text-gray-500">{items.length}</span>
            </div>

            <div className="space-y-2">
              {items.length === 0 && (
                <div className="text-xs text-gray-400 italic text-center py-4">No orders</div>
              )}
              {items.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onOpen={() => setLocation(`/order-form/${order.id}`)}
                  onChangeStatus={(newStatus) =>
                    statusMutation.mutate({ id: order.id, status: newStatus })
                  }
                  disabled={statusMutation.isPending}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: OrderSummary;
  onOpen: () => void;
  onChangeStatus: (next: LifecycleStatus) => void;
  disabled: boolean;
}

function OrderCard({ order, onOpen, onChangeStatus, disabled }: OrderCardProps) {
  // Stop propagation on the select so clicking it doesn't navigate.
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onOpen}
      data-testid={`kanban-card-${order.id}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="font-semibold text-sm truncate" title={order.customerCompany || ""}>
          {order.customerCompany || "—"}
        </div>
        <div className="text-xs text-gray-600 truncate">
          {order.customOrderNumber || order.orderNumber}
        </div>
        <div className="text-sm font-medium">
          {formatTotal(order.grandTotal, order.currency)}
        </div>
        <div className="text-[11px] text-gray-500">
          Status {daysSince(order.statusChangedAt || order.createdAt)}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            value={LIFECYCLE_STATUSES.includes(order.status as LifecycleStatus)
              ? (order.status as LifecycleStatus)
              : undefined}
            onValueChange={(v) => onChangeStatus(v as LifecycleStatus)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs" data-testid={`status-select-${order.id}`}>
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
