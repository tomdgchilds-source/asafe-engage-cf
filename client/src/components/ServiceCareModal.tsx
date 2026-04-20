import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  CheckCircle2,
  Star,
  Settings,
  Check,
  X,
  Clock,
  Headphones,
  GraduationCap,
  Wrench,
  DollarSign,
  CheckCircle,
  Sparkles,
  Crown,
  FileCheck,
  Bell,
  Award,
  UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { getDiscountTier } from "@shared/discountLimits";

/**
 * Service care option as returned by GET /api/service-care-options.
 * The DB seeds four tiers with stable IDs (SERVICE_BASIC / STANDARD /
 * PREMIUM / ENTERPRISE). Display names changed to GCC-buyer-friendly
 * labels (Essential / Plus / Pro / Strategic) to match discount-tier
 * naming and make Essential feel less like "cheap".
 */
interface ServiceCareOption {
  id: string;
  title: string;
  description: string;
  chargeable: boolean;
  value: string; // "Free" or "5%" / "10%" / "15%"
  isActive: boolean;
}

interface UserServiceSelection {
  id: string;
  userId: string;
  serviceOptionId: string;
  isSelected: boolean;
}

interface ServiceCareModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

/** Theme per real DB ID. Drives icon + colour + sort order. */
const TIER_THEME: Record<
  string,
  {
    short: string;
    icon: JSX.Element;
    activeBg: string;
    dimBg: string;
    activeText: string;
    dimText: string;
    valueBadge: string;
    rank: number;
  }
> = {
  SERVICE_BASIC: {
    short: "Essential",
    icon: <Shield className="h-4 w-4" />,
    activeBg: "bg-blue-500 ring-2 ring-blue-300",
    dimBg: "bg-gray-200",
    activeText: "text-blue-600",
    dimText: "text-gray-700",
    valueBadge: "bg-green-100 text-green-800 border-green-300",
    rank: 0,
  },
  SERVICE_STANDARD: {
    short: "Plus",
    icon: <CheckCircle2 className="h-4 w-4" />,
    activeBg: "bg-blue-500 ring-2 ring-blue-300",
    dimBg: "bg-sky-200",
    activeText: "text-blue-600",
    dimText: "text-sky-700",
    valueBadge: "bg-sky-100 text-sky-800 border-sky-300",
    rank: 1,
  },
  SERVICE_PREMIUM: {
    short: "Pro",
    icon: <Star className="h-4 w-4" />,
    activeBg: "bg-blue-500 ring-2 ring-blue-300",
    dimBg: "bg-yellow-200",
    activeText: "text-blue-600",
    dimText: "text-yellow-700",
    valueBadge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    rank: 2,
  },
  SERVICE_ENTERPRISE: {
    short: "Strategic",
    icon: <Crown className="h-4 w-4" />,
    activeBg: "bg-blue-500 ring-2 ring-blue-300",
    dimBg: "bg-purple-200",
    activeText: "text-blue-600",
    dimText: "text-purple-700",
    valueBadge: "bg-purple-100 text-purple-800 border-purple-300",
    rank: 3,
  },
};

/**
 * Feature matrix. Hand-tuned so each $ step-up has a clear extra value
 * a sales rep can point at. Notes on design:
 *  - Essential has *something* (portal, bulletin) instead of being empty —
 *    otherwise it reads as "marketing tier" and erodes trust.
 *  - Plus and Pro have a hard commercial split (priority vs same-day,
 *    parts at-cost vs parts free).
 *  - Strategic owns the audit-report + 4h SLA; hard for competitors to copy.
 *  - Warranty extension is capped "+N years OR 10M impact cycles" so a
 *    runaway claim on a high-traffic site doesn't destroy margin.
 */
const COMPARISON_FEATURES: Array<{
  icon: JSX.Element;
  name: string;
  description: string;
  values: Record<string, string | boolean>;
}> = [
  {
    icon: <Check className="h-4 w-4" />,
    name: "Safety inspection",
    description: "Visual barrier condition & impact-wear check on site.",
    values: {
      SERVICE_BASIC: "Annual",
      SERVICE_STANDARD: "Bi-annual",
      SERVICE_PREMIUM: "Quarterly",
      SERVICE_ENTERPRISE: "Monthly",
    },
  },
  {
    icon: <Bell className="h-4 w-4" />,
    name: "Incident-reporting portal",
    description: "Customer-side portal to log barrier impacts + photos.",
    values: {
      SERVICE_BASIC: true,
      SERVICE_STANDARD: true,
      SERVICE_PREMIUM: true,
      SERVICE_ENTERPRISE: true,
    },
  },
  {
    icon: <FileCheck className="h-4 w-4" />,
    name: "Product bulletin",
    description: "Quarterly A-SAFE product & standards update.",
    values: {
      SERVICE_BASIC: "Quarterly",
      SERVICE_STANDARD: "Quarterly",
      SERVICE_PREMIUM: "Quarterly",
      SERVICE_ENTERPRISE: "Quarterly",
    },
  },
  {
    icon: <Wrench className="h-4 w-4" />,
    name: "Maintenance visits",
    description: "Scheduled on-site servicing by A-SAFE engineers.",
    values: {
      SERVICE_BASIC: false,
      SERVICE_STANDARD: "1 / year",
      SERVICE_PREMIUM: "2 / year",
      SERVICE_ENTERPRISE: "Unlimited",
    },
  },
  {
    icon: <Wrench className="h-4 w-4" />,
    name: "Minor repairs in visit",
    description: "Small-part replacement during scheduled visits.",
    values: {
      SERVICE_BASIC: false,
      SERVICE_STANDARD: true,
      SERVICE_PREMIUM: true,
      SERVICE_ENTERPRISE: true,
    },
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    name: "Replacement parts",
    description: "Cost of replacement parts after barrier impacts.",
    values: {
      SERVICE_BASIC: false,
      SERVICE_STANDARD: false,
      SERVICE_PREMIUM: "At cost",
      SERVICE_ENTERPRISE: "Free + priority stock",
    },
  },
  {
    icon: <Headphones className="h-4 w-4" />,
    name: "Technical support",
    description: "Help from A-SAFE engineering / compliance team.",
    values: {
      SERVICE_BASIC: "Business hours",
      SERVICE_STANDARD: "Priority (business hours)",
      SERVICE_PREMIUM: "Same-day for critical",
      SERVICE_ENTERPRISE: "24 / 7",
    },
  },
  {
    icon: <Clock className="h-4 w-4" />,
    name: "Response SLA",
    description: "Time to first meaningful response on a support request.",
    values: {
      SERVICE_BASIC: "7 days",
      SERVICE_STANDARD: "3 business days",
      SERVICE_PREMIUM: "1 business day",
      SERVICE_ENTERPRISE: "4 hours",
    },
  },
  {
    icon: <UserCheck className="h-4 w-4" />,
    name: "Named contact",
    description: "Direct-line engineer / account contact for your team.",
    values: {
      SERVICE_BASIC: false,
      SERVICE_STANDARD: false,
      SERVICE_PREMIUM: "Named engineer",
      SERVICE_ENTERPRISE: "Dedicated account manager",
    },
  },
  {
    icon: <GraduationCap className="h-4 w-4" />,
    name: "Staff training",
    description: "On-site training + competency certification.",
    values: {
      SERVICE_BASIC: "Documentation only",
      SERVICE_STANDARD: "One starter session",
      SERVICE_PREMIUM: "Annual refresher",
      SERVICE_ENTERPRISE: "Quarterly + certified programme",
    },
  },
  {
    icon: <Shield className="h-4 w-4" />,
    name: "Extended warranty",
    description: "Additional cover beyond the standard A-SAFE warranty.",
    values: {
      SERVICE_BASIC: false,
      SERVICE_STANDARD: "+1 year*",
      SERVICE_PREMIUM: "+2 years*",
      SERVICE_ENTERPRISE: "+3 years*",
    },
  },
  {
    icon: <Award className="h-4 w-4" />,
    name: "PAS 13 conformance audit",
    description: "Annual on-site audit + signed conformance certificate.",
    values: {
      SERVICE_BASIC: false,
      SERVICE_STANDARD: false,
      SERVICE_PREMIUM: false,
      SERVICE_ENTERPRISE: "Signed, annual",
    },
  },
];

function renderCell(value: string | boolean | undefined) {
  if (value === true) return <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 mx-auto" />;
  if (value === false || value === undefined)
    return <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 mx-auto" />;
  return <span className="text-xs sm:text-sm text-gray-700 font-medium">{value}</span>;
}

/** Cart item shape (lightweight — we only read totalPrice). */
interface CartItemLite {
  id: string;
  totalPrice?: number | string | null;
}

/**
 * Map a cart-subtotal tier label (from `getDiscountTier`, which returns
 * "Standard" | "Silver" | "Gold" | "Platinum") to the recommended service
 * tier ID. Keeps the two discount systems aligned — the bigger the deal,
 * the more support A-SAFE is willing (and able) to bundle.
 */
function recommendedTierForSubtotal(subtotalAed: number): string {
  const tier = getDiscountTier(subtotalAed).label;
  switch (tier) {
    case "Standard":
      return "SERVICE_BASIC";
    case "Silver":
      return "SERVICE_STANDARD";
    case "Gold":
      return "SERVICE_PREMIUM";
    case "Platinum":
      return "SERVICE_ENTERPRISE";
    default:
      return "SERVICE_BASIC";
  }
}

/** Parse a value string like "5%" → 5. "Free" → 0. */
function parseTierPct(v: string | undefined | null): number {
  if (!v) return 0;
  const m = /(\d+(?:\.\d+)?)/.exec(v);
  return m ? parseFloat(m[1]) : 0;
}

function formatAed(n: number): string {
  const rounded = Math.round(n);
  return `AED ${rounded.toLocaleString()}`;
}

export function ServiceCareModal({ isOpen, onClose, user }: ServiceCareModalProps) {
  const [selectedService, setSelectedService] = useState<string>("");
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();

  const { data: serviceOptions = [], isLoading: optionsLoading } = useQuery<ServiceCareOption[]>({
    queryKey: ["/api/service-care-options"],
    enabled: isOpen && !!user,
  });

  const { data: userSelection, isLoading: selectionLoading } = useQuery<UserServiceSelection | null>({
    queryKey: ["/api/user-service-selection"],
    enabled: isOpen && !!user,
  });

  // Cart — used to compute the AED subtotal that drives price anchoring +
  // the "recommended" badge. Cached by TanStack so opening this modal
  // shouldn't trigger an extra fetch in most flows.
  const { data: cartItems = [] } = useQuery<CartItemLite[]>({
    queryKey: ["/api/cart"],
    enabled: isOpen && !!user,
  });
  const cartSubtotal = useMemo(() => {
    return (cartItems || []).reduce((sum, it) => {
      const v = typeof it.totalPrice === "string" ? parseFloat(it.totalPrice) : it.totalPrice;
      return sum + (Number.isFinite(v as number) ? (v as number) : 0);
    }, 0);
  }, [cartItems]);

  const recommendedId = useMemo(() => recommendedTierForSubtotal(cartSubtotal), [cartSubtotal]);

  const orderedOptions = useMemo(() => {
    return [...serviceOptions]
      .filter((o) => o.isActive)
      .sort((a, b) => (TIER_THEME[a.id]?.rank ?? 99) - (TIER_THEME[b.id]?.rank ?? 99));
  }, [serviceOptions]);

  useEffect(() => {
    if (!orderedOptions.length) return;
    if (userSelection?.serviceOptionId && orderedOptions.some((o) => o.id === userSelection.serviceOptionId)) {
      setSelectedService(userSelection.serviceOptionId);
    } else {
      setSelectedService(orderedOptions[0].id);
    }
  }, [userSelection, orderedOptions]);

  const saveSelectionMutation = useMutation({
    mutationFn: async (serviceOptionId: string) => {
      return apiRequest("/api/user-service-selection", "POST", { serviceOptionId });
    },
    onSuccess: () => {
      haptic.save();
      queryClient.invalidateQueries({ queryKey: ["/api/user-service-selection"] });
      toast({
        title: "Service package saved",
        description: "Your ongoing-support tier has been updated.",
      });
      onClose();
    },
    onError: (error: any) => {
      haptic.error();
      toast({
        title: "Couldn't save selection",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (optionsLoading || selectionLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[100vw] max-w-[100vw] max-h-[90vh] overflow-y-auto p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Loading Service Care Options…
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-8">
            <div className="h-6 bg-gray-200 rounded animate-pulse" />
            <div className="h-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-20 bg-gray-200 rounded animate-pulse" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[100vw] max-w-[100vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto p-2 sm:p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-6 w-6" />
            Service Care Package
          </DialogTitle>
          <DialogDescription className="text-base">
            Pick the support tier that matches how often you need A-SAFE engineers on site.
            {cartSubtotal > 0 && (
              <>
                {" "}Figures below show the annual cost applied to your current order of{" "}
                <strong>{formatAed(cartSubtotal)}</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 border-b">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 text-center">
                Service package comparison
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-2 sm:px-6 py-2 sm:py-4 text-left" />
                    {orderedOptions.map((opt) => {
                      const theme = TIER_THEME[opt.id] || {
                        short: opt.title,
                        icon: <Settings className="h-4 w-4" />,
                        activeBg: "bg-blue-500 ring-2 ring-blue-300",
                        dimBg: "bg-gray-200",
                        activeText: "text-blue-600",
                        dimText: "text-gray-700",
                        valueBadge: "bg-gray-100 text-gray-800 border-gray-300",
                        rank: 99,
                      };
                      const isSelected = selectedService === opt.id;
                      const isRecommended = opt.id === recommendedId && cartSubtotal > 0;
                      return (
                        <th
                          key={opt.id}
                          className="px-1 sm:px-6 py-2 sm:py-4 text-center relative"
                        >
                          {isRecommended && (
                            <div
                              className="absolute -top-1 left-1/2 -translate-x-1/2 bg-primary text-black text-[9px] font-bold px-2 py-0.5 rounded-full shadow whitespace-nowrap"
                              data-testid={`recommended-badge-${opt.id}`}
                            >
                              Recommended for this order
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedService(opt.id)}
                            className={`flex flex-col items-center gap-1 sm:gap-2 cursor-pointer transition-all hover:scale-105 mx-auto ${
                              isSelected ? "scale-105" : ""
                            }`}
                            data-testid={`tier-button-${opt.id}`}
                          >
                            <div
                              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                                isSelected ? theme.activeBg : theme.dimBg
                              }`}
                            >
                              <span className={isSelected ? "text-white" : theme.dimText}>
                                {theme.icon}
                              </span>
                            </div>
                            <span
                              className={`text-xs sm:text-sm font-medium ${
                                isSelected ? `${theme.activeText} font-bold` : theme.dimText
                              }`}
                            >
                              {theme.short}
                            </span>
                            {isSelected && <CheckCircle className="h-4 w-4 text-blue-500" />}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map((feature, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-2 sm:px-6 py-2 sm:py-4">
                        <div className="flex items-center gap-1 sm:gap-3">
                          <div className="text-gray-500 p-0.5 sm:p-1 flex-shrink-0">
                            {feature.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                              {feature.name}
                            </div>
                            <div className="hidden sm:block text-[11px] text-gray-500 truncate">
                              {feature.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      {orderedOptions.map((opt) => (
                        <td key={opt.id} className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                          <div className="flex justify-center">
                            {renderCell(feature.values[opt.id])}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* Cost row — real % from DB, with AED annual anchor under it. */}
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <td className="px-2 sm:px-6 py-2 sm:py-4">
                      <div className="flex items-center gap-1 sm:gap-3">
                        <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />
                        <div className="min-w-0">
                          <span className="text-xs sm:text-sm font-semibold text-gray-900">
                            Cost
                          </span>
                          {cartSubtotal > 0 && (
                            <div className="hidden sm:block text-[11px] text-gray-500">
                              On your current order
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {orderedOptions.map((opt) => {
                      const theme = TIER_THEME[opt.id];
                      const display = opt.chargeable ? opt.value : "Free";
                      const pct = parseTierPct(opt.value);
                      const annual = cartSubtotal * (pct / 100);
                      return (
                        <td key={opt.id} className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                          <Badge
                            className={`${
                              theme?.valueBadge ||
                              "bg-green-100 text-green-800 border-green-300"
                            } font-bold text-xs`}
                          >
                            {display}
                          </Badge>
                          {cartSubtotal > 0 && (
                            <div className="text-[11px] text-gray-600 mt-1 font-medium">
                              {opt.chargeable && pct > 0 ? `${formatAed(annual)} / yr` : "—"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 border-t text-[11px] text-gray-600 text-center space-y-1">
              <p>
                Cost is applied as a percentage of the post-discount order subtotal.
                Extended-warranty capped at <strong>10,000,000 impact cycles</strong>
                {" "}(the * marker above).
              </p>
              <p>
                Your selection is attached to each quote and order generated from your cart.
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              className="px-8 py-2"
              data-testid="button-cancel-service"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedService) saveSelectionMutation.mutate(selectedService);
              }}
              disabled={saveSelectionMutation.isPending || !selectedService}
              className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-save-service"
            >
              {saveSelectionMutation.isPending ? "Saving…" : "Save Selection"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
