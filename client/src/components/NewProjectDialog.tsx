import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, ChevronsUpDown, Check, Loader2, Plus } from "lucide-react";
import type { CustomerCompany, Project } from "@shared/schema";
import { LogoSuggestions } from "@/components/LogoSuggestions";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional hook — called after creation with the fresh project */
  onCreated?: (project: Project) => void;
  /** If true, redirect to /projects?id=... after creation */
  navigateOnCreate?: boolean;
}

const NEW_CUSTOMER_VALUE = "__new__";

/**
 * Minimal create-project dialog. Only shows the 5 fields the sales team
 * actually fills at create-time; the rest live on the Overview tab.
 */
export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
  navigateOnCreate = true,
}: NewProjectDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [name, setName] = useState("");
  const [customerCompanyId, setCustomerCompanyId] = useState<string | null>(
    null,
  );
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [inlineCustomerName, setInlineCustomerName] = useState("");
  const [inlineCustomerLogoUrl, setInlineCustomerLogoUrl] = useState("");
  const [inlineCustomerIndustry, setInlineCustomerIndustry] = useState("");
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [location, setSiteLocation] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [setActive, setSetActive] = useState(true);

  const { data: customers = [] } = useQuery<CustomerCompany[]>({
    queryKey: ["/api/customer-companies"],
    enabled: open,
  });

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerCompanyId) || null,
    [customers, customerCompanyId],
  );

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName("");
      setCustomerCompanyId(null);
      setInlineCustomerName("");
      setInlineCustomerLogoUrl("");
      setInlineCustomerIndustry("");
      setIsAddingNewCustomer(false);
      setSiteLocation("");
      setDescription("");
      setStatus("active");
      setSetActive(true);
      setCustomerPickerOpen(false);
    }
  }, [open]);

  const createProject = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        status,
        setActive,
      };

      if (isAddingNewCustomer) {
        if (!inlineCustomerName.trim()) {
          throw new Error("Customer name is required");
        }
        payload.inlineCustomerName = inlineCustomerName.trim();
        if (inlineCustomerLogoUrl.trim()) {
          payload.inlineCustomerLogoUrl = inlineCustomerLogoUrl.trim();
        }
        // Industry lives on the customer record; if the rep typed one,
        // pre-create the customer so we can stash the industry too.
        if (inlineCustomerIndustry.trim()) {
          const created = await apiRequest(
            "/api/customer-companies",
            "POST",
            {
              name: inlineCustomerName.trim(),
              logoUrl: inlineCustomerLogoUrl.trim() || undefined,
              industry: inlineCustomerIndustry.trim(),
            },
          );
          const customer = (await created.json()) as CustomerCompany;
          payload.customerCompanyId = customer.id;
          delete payload.inlineCustomerName;
          delete payload.inlineCustomerLogoUrl;
        }
      } else if (customerCompanyId) {
        payload.customerCompanyId = customerCompanyId;
      }

      const res = await apiRequest("/api/projects", "POST", payload);
      return (await res.json()) as Project;
    },
    onSuccess: (project) => {
      toast({
        title: "Project created",
        description: `${project.name} is ready.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-project"] });
      onCreated?.(project);
      onOpenChange(false);
      if (navigateOnCreate) {
        setLocation(`/projects?id=${project.id}`);
      }
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not create project",
        description:
          error instanceof Error
            ? error.message
            : "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: "Project name is required",
        variant: "destructive",
      });
      return;
    }
    if (!customerCompanyId && !isAddingNewCustomer) {
      toast({
        title: "Pick a customer",
        description:
          "Choose an existing customer or add a new one for this project.",
        variant: "destructive",
      });
      return;
    }
    if (isAddingNewCustomer && !inlineCustomerName.trim()) {
      toast({
        title: "Customer name is required",
        variant: "destructive",
      });
      return;
    }
    createProject.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Set up a new opportunity. Delivery, installation, and
            approval preferences can be edited later on the project page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="np-name">Project name *</Label>
            <Input
              id="np-name"
              placeholder="Dnata Warehouse A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-new-project-name"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Customer company *</Label>
            <Popover
              open={customerPickerOpen}
              onOpenChange={setCustomerPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerPickerOpen}
                  className="w-full justify-between min-h-[44px]"
                  data-testid="button-pick-customer"
                >
                  {isAddingNewCustomer ? (
                    <span className="flex items-center gap-2 text-foreground">
                      <Plus className="h-4 w-4" />
                      New customer
                    </span>
                  ) : selectedCustomer ? (
                    <span className="flex items-center gap-2 text-foreground">
                      <CustomerThumb customer={selectedCustomer} />
                      {selectedCustomer.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Pick a customer...
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search customers..." />
                  <CommandList>
                    <CommandEmpty>No customers yet.</CommandEmpty>
                    <CommandGroup>
                      {customers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setCustomerCompanyId(c.id);
                            setIsAddingNewCustomer(false);
                            setCustomerPickerOpen(false);
                          }}
                          data-testid={`customer-opt-${c.id}`}
                        >
                          <CustomerThumb customer={c} />
                          <span className="ml-2 flex-1">{c.name}</span>
                          {customerCompanyId === c.id && (
                            <Check className="h-4 w-4" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        value={NEW_CUSTOMER_VALUE}
                        onSelect={() => {
                          setIsAddingNewCustomer(true);
                          setCustomerCompanyId(null);
                          setCustomerPickerOpen(false);
                        }}
                        data-testid="customer-opt-new"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add new customer
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {isAddingNewCustomer && (
              <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 space-y-3 mt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="np-new-customer-name">Customer name *</Label>
                  <Input
                    id="np-new-customer-name"
                    placeholder="Dnata"
                    value={inlineCustomerName}
                    onChange={(e) => setInlineCustomerName(e.target.value)}
                    data-testid="input-inline-customer-name"
                  />
                </div>
                <LogoSuggestions
                  query={inlineCustomerName}
                  value={inlineCustomerLogoUrl || null}
                  onChange={(url) => setInlineCustomerLogoUrl(url ?? "")}
                  label="Logo"
                />

                <div className="space-y-1.5">
                  <Label htmlFor="np-new-customer-industry">Industry</Label>
                  <Input
                    id="np-new-customer-industry"
                    placeholder="Logistics"
                    value={inlineCustomerIndustry}
                    onChange={(e) => setInlineCustomerIndustry(e.target.value)}
                    data-testid="input-inline-customer-industry"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-location">Location</Label>
            <Input
              id="np-location"
              placeholder="Jebel Ali, Dubai"
              value={location}
              onChange={(e) => setSiteLocation(e.target.value)}
              data-testid="input-new-project-location"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-description">Description</Label>
            <Textarea
              id="np-description"
              placeholder="Fit-out of new warehouse including racking protection and pedestrian barriers."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="textarea-new-project-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="np-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="np-status" data-testid="select-new-project-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="np-setactive"
              checked={setActive}
              onCheckedChange={(v) => setSetActive(!!v)}
              data-testid="checkbox-set-active"
            />
            <Label htmlFor="np-setactive" className="cursor-pointer font-normal">
              Make this my active project
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-new-project"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createProject.isPending}
              className="bg-[#FFC72C] text-black hover:bg-[#FFB700]"
              data-testid="button-submit-new-project"
            >
              {createProject.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create project"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerThumb({ customer }: { customer: CustomerCompany }) {
  const initials = customer.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  if (customer.logoUrl) {
    return (
      <img
        src={customer.logoUrl}
        alt={customer.name}
        className="h-5 w-5 rounded-full object-cover border border-border"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div className="h-5 w-5 rounded-full bg-[#FFC72C] flex items-center justify-center">
      {initials ? (
        <span className="text-[9px] font-bold text-black">{initials}</span>
      ) : (
        <Building2 className="h-3 w-3 text-black" />
      )}
    </div>
  );
}
