// ═══════════════════════════════════════════════════════════════════
// CustomItemDialog
// ═══════════════════════════════════════════════════════════════════
// Reps regularly need a line the price list doesn't carry — a bespoke
// ramp, crane hire, a non-catalogue bracket — and used to bury it in
// the notes where it never reached the totals. This dialog adds a
// custom line to the cart (POST /api/cart/custom) with an indicative
// price and a clear "who stands behind this number" basis, and can
// save it to the rep's library for next time.
//
// Two tabs: "New item" (the form) and "My library" (CustomItemsLibrary).
// Opened from the cart ("Add custom item") and from the products grid
// ("Can't find what you need?"). Controlled: the caller owns `open`.
// `AddCustomItemButton` wraps the common button + dialog pairing.

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PackagePlus, BookMarked, Sparkles } from "lucide-react";
import { CustomItemsLibrary } from "@/components/CustomItemsLibrary";
import {
  type CustomCategory,
  type CustomItemErrors,
  type CustomItemInput,
  type CustomPricingType,
  type SavedCustomItem,
  CUSTOM_CATEGORY_OPTIONS,
  PRICING_BASIS_LABELS,
  customItemToCartPayload,
  emptyCustomItem,
  formatAed,
  parseNumberInput,
  round2,
  savedItemToFormInput,
  validateCustomItem,
} from "@/lib/customItems";

export type CustomItemDialogTab = "new" | "library";

interface CustomItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: CustomItemDialogTab;
}

export function CustomItemDialog({ open, onOpenChange, defaultTab = "new" }: CustomItemDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const { formatPrice, selectedCurrency } = useCurrency();
  const money = (aed: number) => (selectedCurrency === "AED" ? formatAed(aed) : formatPrice(aed));

  const [tab, setTab] = useState<CustomItemDialogTab>(defaultTab);
  const [form, setForm] = useState<CustomItemInput>(() => emptyCustomItem());
  // Numeric fields are kept as text while typing so "1." and "" survive.
  const [qtyText, setQtyText] = useState("1");
  const [priceText, setPriceText] = useState("");
  const [errors, setErrors] = useState<CustomItemErrors>({});
  const [touched, setTouched] = useState(false);

  // Reset to a clean form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setForm(emptyCustomItem());
      setQtyText("1");
      setPriceText("");
      setErrors({});
      setTouched(false);
    }
  }, [open, defaultTab]);

  const current = (): CustomItemInput => ({
    ...form,
    quantity: parseNumberInput(qtyText),
    unitPrice: parseNumberInput(priceText),
  });

  const patch = <K extends keyof CustomItemInput>(key: K, value: CustomItemInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  // Live re-validate once the rep has tried to submit.
  useEffect(() => {
    if (!touched) return;
    setErrors(validateCustomItem(current()).errors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, qtyText, priceText, touched]);

  const addMutation = useMutation({
    mutationFn: async (input: CustomItemInput) => {
      const res = await apiRequest("/api/cart/custom", "POST", customItemToCartPayload(input));
      return res.json().catch(() => null);
    },
    onSuccess: (_data, input) => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      if (input.saveToLibrary) {
        queryClient.invalidateQueries({ queryKey: ["/api/custom-items"] });
      }
      toast({
        title: "Custom item added",
        description: `${input.productName.trim()} — indicative, ${PRICING_BASIS_LABELS[input.pricingBasis].toLowerCase()}.`,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't add the custom item",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    const input = current();
    const result = validateCustomItem(input);
    setErrors(result.errors);
    if (!result.ok) {
      haptic.select();
      return;
    }
    addMutation.mutate(input);
  };

  const loadFromLibrary = (item: SavedCustomItem) => {
    const next = savedItemToFormInput(item);
    setForm(next);
    setQtyText("1");
    setPriceText(Number.isFinite(next.unitPrice) ? String(next.unitPrice) : "");
    setErrors({});
    setTouched(false);
    setTab("new");
  };

  const isMetre = form.pricingType === "linear_meter";
  const qtyNum = parseNumberInput(qtyText);
  const priceNum = parseNumberInput(priceText);
  const preview =
    Number.isFinite(qtyNum) && Number.isFinite(priceNum) && qtyNum > 0 && priceNum >= 0
      ? round2(qtyNum * priceNum)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6"
        data-testid="custom-item-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            Add a custom item
          </DialogTitle>
          <DialogDescription>
            For client-specific needs the price list doesn't cover. The price is indicative and
            flagged as such on the order form.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as CustomItemDialogTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" data-testid="custom-item-tab-new">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              New item
            </TabsTrigger>
            <TabsTrigger value="library" data-testid="custom-item-tab-library">
              <BookMarked className="h-3.5 w-3.5 mr-1.5" />
              My library
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Name */}
              <div className="space-y-1">
                <Label htmlFor="custom-item-name" className="text-xs font-medium">
                  Item name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="custom-item-name"
                  value={form.productName}
                  onChange={(e) => patch("productName", e.target.value)}
                  placeholder="e.g. Bespoke dock ramp, 3 m"
                  maxLength={160}
                  autoFocus
                  data-testid="custom-item-name"
                />
                {errors.productName && (
                  <p className="text-xs text-red-600" data-testid="custom-item-error-name">
                    {errors.productName}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label htmlFor="custom-item-description" className="text-xs font-medium">
                  Description
                </Label>
                <Textarea
                  id="custom-item-description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => patch("description", e.target.value)}
                  placeholder="What it is and what it is for — shown on the order form."
                  data-testid="custom-item-description"
                />
              </div>

              {/* Category + unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Category</Label>
                  <Select
                    value={form.customCategory}
                    onValueChange={(v) => patch("customCategory", v as CustomCategory)}
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid="custom-item-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100020]">
                      {CUSTOM_CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.customCategory && <p className="text-xs text-red-600">{errors.customCategory}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Priced</Label>
                  <Select
                    value={form.pricingType}
                    onValueChange={(v) => {
                      patch("pricingType", v as CustomPricingType);
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid="custom-item-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[100020]">
                      <SelectItem value="standard_item">Per item (each)</SelectItem>
                      <SelectItem value="linear_meter">Per metre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quantity + unit price */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="custom-item-qty" className="text-xs font-medium">
                    {isMetre ? "Run length (m)" : "Quantity"} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="custom-item-qty"
                    type="number"
                    inputMode="decimal"
                    min={isMetre ? 0.1 : 1}
                    step={isMetre ? 0.1 : 1}
                    value={qtyText}
                    onChange={(e) => setQtyText(e.target.value)}
                    data-testid="custom-item-qty"
                  />
                  {errors.quantity && (
                    <p className="text-xs text-red-600" data-testid="custom-item-error-qty">
                      {errors.quantity}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="custom-item-price" className="text-xs font-medium">
                    Unit price (AED{isMetre ? " / m" : ""}) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="custom-item-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    placeholder="0.00"
                    data-testid="custom-item-price"
                  />
                  {errors.unitPrice && (
                    <p className="text-xs text-red-600" data-testid="custom-item-error-price">
                      {errors.unitPrice}
                    </p>
                  )}
                </div>
              </div>

              {preview !== null && (
                <p className="text-xs text-gray-600 dark:text-gray-400" data-testid="custom-item-preview">
                  Line total (indicative): <strong>{money(preview)}</strong>
                  {selectedCurrency !== "AED" && <span className="ml-1">({formatAed(preview)})</span>}
                </p>
              )}

              {/* Delivery + installation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  htmlFor="custom-item-delivery"
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 cursor-pointer"
                >
                  <span className="text-sm">Needs delivery</span>
                  <Switch
                    id="custom-item-delivery"
                    checked={form.requiresDelivery}
                    onCheckedChange={(v) => patch("requiresDelivery", v)}
                    data-testid="custom-item-delivery"
                  />
                </label>
                <label
                  htmlFor="custom-item-installation"
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 cursor-pointer"
                >
                  <span className="text-sm">Needs installation</span>
                  <Switch
                    id="custom-item-installation"
                    checked={form.requiresInstallation}
                    onCheckedChange={(v) => patch("requiresInstallation", v)}
                    data-testid="custom-item-installation"
                  />
                </label>
              </div>

              {/* Pricing basis */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Pricing basis</Label>
                <RadioGroup
                  value={form.pricingBasis}
                  onValueChange={(v) => patch("pricingBasis", v as CustomItemInput["pricingBasis"])}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                  data-testid="custom-item-basis"
                >
                  <label
                    htmlFor="custom-item-basis-rep"
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer ${
                      form.pricingBasis === "rep_estimate" ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <RadioGroupItem value="rep_estimate" id="custom-item-basis-rep" className="mt-0.5" data-testid="custom-item-basis-rep" />
                    <span>
                      <span className="block text-sm font-medium">{PRICING_BASIS_LABELS.rep_estimate}</span>
                      <span className="block text-[11px] text-gray-500">You are confident in this figure.</span>
                    </span>
                  </label>
                  <label
                    htmlFor="custom-item-basis-estimation"
                    className={`flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer ${
                      form.pricingBasis === "estimation_team" ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <RadioGroupItem value="estimation_team" id="custom-item-basis-estimation" className="mt-0.5" data-testid="custom-item-basis-estimation" />
                    <span>
                      <span className="block text-sm font-medium">{PRICING_BASIS_LABELS.estimation_team}</span>
                      <span className="block text-[11px] text-gray-500">Placeholder; estimation will price it.</span>
                    </span>
                  </label>
                </RadioGroup>
                {errors.pricingBasis && <p className="text-xs text-red-600">{errors.pricingBasis}</p>}
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="custom-item-notes" className="text-xs font-medium">
                  Notes for estimation / installation
                </Label>
                <Textarea
                  id="custom-item-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => patch("notes", e.target.value)}
                  placeholder="Supplier, lead time, drawings attached, anything that affects the price."
                  data-testid="custom-item-notes"
                />
                {errors.notes && <p className="text-xs text-red-600">{errors.notes}</p>}
              </div>

              {/* Save to library */}
              <label
                htmlFor="custom-item-save-library"
                className="flex items-center gap-2 text-sm cursor-pointer select-none"
              >
                <Checkbox
                  id="custom-item-save-library"
                  checked={form.saveToLibrary}
                  onCheckedChange={(v) => patch("saveToLibrary", v === true)}
                  data-testid="custom-item-save-library"
                />
                Save to my library for next time
              </label>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={addMutation.isPending}
                  data-testid="custom-item-cancel"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addMutation.isPending} data-testid="custom-item-submit">
                  <PackagePlus className="h-4 w-4 mr-2" />
                  {addMutation.isPending ? "Adding…" : "Add to cart"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="library" className="mt-4">
            <CustomItemsLibrary onAdded={() => onOpenChange(false)} onEdit={loadFromLibrary} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface AddCustomItemButtonProps {
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  children?: ReactNode;
  defaultTab?: CustomItemDialogTab;
  testId?: string;
}

/** Button that owns the dialog's open state — for the cart. */
export function AddCustomItemButton({
  className,
  variant = "outline",
  size,
  children,
  defaultTab,
  testId = "button-add-custom-item",
}: AddCustomItemButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {children ?? (
          <>
            <PackagePlus className="h-4 w-4" />
            <span className="text-sm">Add custom item</span>
          </>
        )}
      </Button>
      <CustomItemDialog open={open} onOpenChange={setOpen} defaultTab={defaultTab} />
    </>
  );
}
