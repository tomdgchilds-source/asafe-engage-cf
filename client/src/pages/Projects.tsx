import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { apiRequest } from "@/lib/queryClient";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { LogoSuggestions } from "@/components/LogoSuggestions";
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Star,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Loader2,
  Users,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Project,
  CustomerCompany,
  ProjectContact,
} from "@shared/schema";

// ─── Collaborator types (UI-local; server owns the source of truth) ──

type CollaboratorRole = "owner" | "editor" | "viewer";

type CollaboratorUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

type Collaborator = {
  id: string;
  userId: string;
  role: CollaboratorRole;
  invitedBy: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  user: CollaboratorUser;
};

type SearchableUser = CollaboratorUser;

const ROLE_LABELS: Record<CollaboratorRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

function formatUserName(u: Partial<CollaboratorUser> | null | undefined) {
  if (!u) return "Unknown";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || "Unknown";
}

function formatInviteDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type ProjectWithCustomer = Project & {
  customerCompany: CustomerCompany | null;
};
type ProjectDetail = Project & {
  customerCompany: CustomerCompany | null;
  contacts: ProjectContact[];
};
type ActiveProject =
  | (Project & {
      customerCompany: CustomerCompany | null;
      contacts: ProjectContact[];
    })
  | null;

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "on_hold", label: "On hold" },
] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  won: {
    label: "Won",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  lost: {
    label: "Lost",
    className: "bg-rose-100 text-rose-800 border-rose-200",
  },
  on_hold: {
    label: "On hold",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
};

const ROLE_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "technical_approver", label: "Technical approver" },
  { value: "commercial_approver", label: "Commercial approver" },
  { value: "marketing_lead", label: "Marketing lead" },
  { value: "pm", label: "PM" },
  { value: "other", label: "Other" },
] as const;

const ROLE_ORDER = [
  "primary",
  "technical_approver",
  "commercial_approver",
  "marketing_lead",
  "pm",
  "other",
] as const;

export default function Projects() {
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>(
    "all",
  );
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Accept ?id= on first mount — the switcher navigates here after creating.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) setSelectedId(id);
  }, [location]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<
    ProjectWithCustomer[]
  >({
    queryKey: ["/api/projects"],
  });

  const { data: active } = useQuery<ActiveProject>({
    queryKey: ["/api/active-project"],
  });

  // When no id is selected yet, default to the active project once data arrives.
  useEffect(() => {
    if (!selectedId) {
      if (active?.id) setSelectedId(active.id);
      else if (projects[0]?.id) setSelectedId(projects[0].id);
    }
  }, [active, projects, selectedId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) => {
      const aT = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0;
      const bT = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0;
      return bT - aT;
    });
    return sorted.filter((p) => {
      if (filter !== "all" && (p.status ?? "active") !== filter) return false;
      if (!needle) return true;
      const custName = p.customerCompany?.name?.toLowerCase() ?? "";
      return (
        p.name.toLowerCase().includes(needle) ||
        custName.includes(needle) ||
        (p.location ?? "").toLowerCase().includes(needle)
      );
    });
  }, [projects, filter, search]);

  return (
    <div className="min-h-[calc(100vh-6rem)]">
      <div className="flex flex-col md:flex-row gap-0 md:h-[calc(100vh-6rem)] rounded-lg border border-border overflow-hidden bg-card">
        {/* List pane */}
        <aside
          className={cn(
            "w-full md:w-[300px] lg:w-[340px] md:flex-shrink-0",
            "md:border-r md:border-border md:h-full md:overflow-y-auto",
            "bg-card",
          )}
        >
          <div className="p-4 border-b border-border sticky top-0 bg-card z-10">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold text-foreground">Projects</h1>
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="bg-[#FFC72C] text-black hover:bg-[#FFB700] font-semibold"
                data-testid="button-new-project-page"
              >
                <Plus className="h-4 w-4 mr-1" />
                New project
              </Button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
                data-testid="input-projects-search"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                    filter === f.value
                      ? "bg-[#FFC72C] text-black border-[#FFC72C] font-semibold"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                  )}
                  data-testid={`filter-${f.value}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2 space-y-2">
            {projectsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                {projects.length === 0
                  ? "No projects yet. Create one to get started."
                  : "No projects match your filters."}
              </div>
            ) : (
              filtered.map((p) => (
                <ProjectListCard
                  key={p.id}
                  project={p}
                  selected={p.id === selectedId}
                  isActive={p.id === active?.id}
                  isShared={
                    !!currentUser && (currentUser as { id?: string }).id
                      ? p.userId !== (currentUser as { id: string }).id
                      : false
                  }
                  onClick={() => setSelectedId(p.id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Detail pane */}
        <main className="flex-1 min-w-0 md:h-full md:overflow-y-auto bg-background">
          {selectedId ? (
            <ProjectDetailPane
              projectId={selectedId}
              isActive={selectedId === active?.id}
              onDeselect={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Select a project on the left to see the details.
              </p>
            </div>
          )}
        </main>
      </div>

      <NewProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(p) => {
          setSelectedId(p.id);
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        }}
        navigateOnCreate={false}
      />
    </div>
  );
}

// ─── List card ──────────────────────────────────────────────────────

function ProjectListCard({
  project,
  selected,
  isActive,
  isShared,
  onClick,
}: {
  project: ProjectWithCustomer;
  selected: boolean;
  isActive: boolean;
  isShared: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[project.status ?? "active"];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border bg-background p-3 transition-colors",
        "hover:bg-muted/40 min-h-[64px]",
        selected ? "border-[#FFC72C]" : "border-border",
        isActive && "border-l-4 border-l-[#FFC72C]",
      )}
      data-testid={`project-card-${project.id}`}
    >
      <div className="flex items-start gap-2.5">
        <CustomerAvatar
          name={project.customerCompany?.name ?? project.name}
          logoUrl={project.customerCompany?.logoUrl ?? null}
          size={32}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {project.customerCompany?.name ?? "No customer"}
            </span>
            {isActive && (
              <Badge className="bg-[#FFC72C] text-black hover:bg-[#FFC72C] text-[9px] px-1.5 py-0">
                Active
              </Badge>
            )}
            {isShared && (
              <Badge
                className="bg-[#FFC72C]/20 text-black border border-[#FFC72C] hover:bg-[#FFC72C]/30 text-[9px] px-1.5 py-0 inline-flex items-center gap-0.5"
                title="Shared"
                data-testid={`project-shared-badge-${project.id}`}
              >
                <Users className="h-2.5 w-2.5" />
                Shared
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {project.name}
          </div>
          {project.location && (
            <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3" />
              {project.location}
            </div>
          )}
        </div>
        {meta && (
          <Badge
            variant="outline"
            className={cn("text-[9px] px-1.5 py-0 shrink-0", meta.className)}
          >
            {meta.label}
          </Badge>
        )}
      </div>
    </button>
  );
}

// ─── Detail pane ────────────────────────────────────────────────────

function ProjectDetailPane({
  projectId,
  isActive,
  onDeselect,
}: {
  projectId: string;
  isActive: boolean;
  onDeselect: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: [`/api/projects/${projectId}`],
  });

  const { data: contacts = [] } = useQuery<ProjectContact[]>({
    queryKey: [`/api/projects/${projectId}/contacts`],
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [deliveryDraft, setDeliveryDraft] = useState("");

  useEffect(() => {
    if (project) {
      setNameDraft(project.name);
      setLocationDraft(project.location ?? "");
      setDescriptionDraft(project.description ?? "");
      setDeliveryDraft(project.defaultDeliveryAddress ?? "");
    }
  }, [project?.id]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({
      queryKey: [`/api/projects/${projectId}`],
    });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/active-project"] });
  };

  const updateProject = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await apiRequest(
        `/api/projects/${projectId}`,
        "PATCH",
        patch,
      );
      return (await res.json()) as Project;
    },
    onSuccess: () => {
      invalidateProject();
    },
    onError: (error: unknown) => {
      toast({
        title: "Save failed",
        description:
          error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const makeActive = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/active-project", "POST", {
        projectId,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/active-project"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Now working on this project",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not make active",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const meta = STATUS_META[project.status ?? "active"];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  const v = nameDraft.trim();
                  if (v && v !== project.name) {
                    updateProject.mutate({ name: v });
                  } else {
                    setNameDraft(project.name);
                  }
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    setNameDraft(project.name);
                    setEditingName(false);
                  }
                }}
                autoFocus
                className="text-xl font-bold"
                data-testid="input-project-name-edit"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2 hover:text-primary transition-colors group"
                data-testid="button-edit-project-name"
              >
                {project.name}
                <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50" />
              </button>
            )}
            <div className="text-sm text-muted-foreground">
              {project.customerCompany?.name ?? "No customer set"}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={project.status ?? "active"}
              onValueChange={(v) => updateProject.mutate({ status: v })}
            >
              <SelectTrigger
                className="h-9 w-[140px]"
                data-testid="select-project-status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
              </SelectContent>
            </Select>
            {isActive ? (
              <Badge className="bg-[#FFC72C] text-black hover:bg-[#FFC72C]">
                <Star className="h-3 w-3 mr-1 fill-black" />
                Working on this
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => makeActive.mutate()}
                disabled={makeActive.isPending}
                data-testid="button-make-active"
              >
                {makeActive.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Make active"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            Contacts
          </TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">
            <Users className="h-3.5 w-3.5 mr-1" />
            Team
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <CustomerCard customer={project.customerCompany} />

          <Card>
            <CardContent className="p-4 space-y-4">
              <InlineField
                label="Location"
                placeholder="Site location, city"
                value={project.location ?? ""}
                draft={locationDraft}
                setDraft={setLocationDraft}
                editing={editingLocation}
                setEditing={setEditingLocation}
                onSave={(v) => updateProject.mutate({ location: v || null })}
              />
              <InlineField
                label="Description"
                multiline
                placeholder="What is this project about?"
                value={project.description ?? ""}
                draft={descriptionDraft}
                setDraft={setDescriptionDraft}
                editing={editingDescription}
                setEditing={setEditingDescription}
                onSave={(v) => updateProject.mutate({ description: v || null })}
              />
              <InlineField
                label="Default delivery address"
                multiline
                placeholder="Where should orders ship by default?"
                value={project.defaultDeliveryAddress ?? ""}
                draft={deliveryDraft}
                setDraft={setDeliveryDraft}
                editing={editingDelivery}
                setEditing={setEditingDelivery}
                onSave={(v) =>
                  updateProject.mutate({ defaultDeliveryAddress: v || null })
                }
              />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Default installation complexity
                </Label>
                <Select
                  value={project.defaultInstallationComplexity ?? "none"}
                  onValueChange={(v) =>
                    updateProject.mutate({
                      defaultInstallationComplexity:
                        v === "none" ? null : v,
                    })
                  }
                >
                  <SelectTrigger
                    className="h-9 w-full md:w-[220px]"
                    data-testid="select-installation-complexity"
                  >
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    <SelectItem value="simple">Simple</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="complex">Complex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold text-foreground mb-1">
                Preferences
              </div>
              <p className="text-xs text-muted-foreground">
                Preferred reciprocal commitments and service tier for
                one-click reapplication coming soon.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts tab */}
        <TabsContent value="contacts" className="mt-4">
          <ContactsSection projectId={projectId} contacts={contacts} />
        </TabsContent>

        {/* Team tab */}
        <TabsContent value="team" className="mt-4">
          <TeamSection
            projectId={projectId}
            projectName={project.name}
            ownerUserId={project.userId}
          />
        </TabsContent>

        {/* Activity stub */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Activity timeline coming soon.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Customer card ──────────────────────────────────────────────────

function CustomerCard({ customer }: { customer: CustomerCompany | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<CustomerCompany>>({});

  useEffect(() => {
    if (customer) setDraft(customer);
  }, [customer?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!customer) return null;
      const res = await apiRequest(
        `/api/customer-companies/${customer.id}`,
        "PATCH",
        {
          name: draft.name ?? customer.name,
          industry: draft.industry ?? null,
          logoUrl: draft.logoUrl ?? null,
          city: draft.city ?? null,
          country: draft.country ?? null,
          website: draft.website ?? null,
        },
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/active-project"] });
      // Refresh the project detail too (it embeds customerCompany)
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0];
        return typeof k === "string" && k.startsWith("/api/projects/");
      }});
      toast({ title: "Customer updated" });
      setEditing(false);
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not save customer",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  if (!customer) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No customer linked to this project yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <CustomerAvatar
            name={customer.name}
            logoUrl={customer.logoUrl}
            size={48}
          />
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <Input
                  value={draft.name ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="Customer name"
                  data-testid="input-customer-name"
                />
                <Input
                  value={draft.industry ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, industry: e.target.value }))
                  }
                  placeholder="Industry"
                  data-testid="input-customer-industry"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={draft.city ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, city: e.target.value }))
                    }
                    placeholder="City"
                    data-testid="input-customer-city"
                  />
                  <Input
                    value={draft.country ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, country: e.target.value }))
                    }
                    placeholder="Country"
                    data-testid="input-customer-country"
                  />
                </div>
                <LogoSuggestions
                  query={draft.name ?? customer.name}
                  value={draft.logoUrl ?? null}
                  onChange={(url) =>
                    setDraft((d) => ({ ...d, logoUrl: url }))
                  }
                  label="Logo"
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => save.mutate()}
                    disabled={save.isPending}
                    className="bg-[#FFC72C] text-black hover:bg-[#FFB700]"
                    data-testid="button-save-customer"
                  >
                    {save.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft(customer);
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold text-foreground truncate">
                    {customer.name}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(true)}
                    data-testid="button-edit-customer"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                  {customer.industry && <div>{customer.industry}</div>}
                  {(customer.city || customer.country) && (
                    <div>
                      {[customer.city, customer.country]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                  {customer.website && (
                    <a
                      href={customer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {customer.website}
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Inline field (text / textarea) ─────────────────────────────────

function InlineField({
  label,
  value,
  draft,
  setDraft,
  editing,
  setEditing,
  onSave,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  draft: string;
  setDraft: (v: string) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onSave: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const commit = () => {
    const v = draft.trim();
    if (v !== (value ?? "")) onSave(v);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        multiline ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
            }}
            rows={3}
            autoFocus
            placeholder={placeholder}
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") cancel();
            }}
            autoFocus
            placeholder={placeholder}
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "w-full text-left rounded-md border border-transparent px-2 py-1.5",
            "hover:bg-muted/40 hover:border-border transition-colors min-h-[36px]",
            "text-sm",
            !value && "text-muted-foreground italic",
          )}
          data-testid={`inline-field-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {value || placeholder || "Not set"}
        </button>
      )}
    </div>
  );
}

// ─── Contacts ───────────────────────────────────────────────────────

function ContactsSection({
  projectId,
  contacts,
}: {
  projectId: string;
  contacts: ProjectContact[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const [form, setForm] = useState({
    name: "",
    jobTitle: "",
    email: "",
    mobile: "",
    role: "primary",
    notes: "",
  });

  const resetForm = () =>
    setForm({
      name: "",
      jobTitle: "",
      email: "",
      mobile: "",
      role: "primary",
      notes: "",
    });

  const addContact = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        `/api/projects/${projectId}/contacts`,
        "POST",
        {
          name: form.name.trim(),
          jobTitle: form.jobTitle.trim() || undefined,
          email: form.email.trim() || undefined,
          mobile: form.mobile.trim() || undefined,
          role: form.role,
          notes: form.notes.trim() || undefined,
        },
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact added" });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/contacts`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}`],
      });
      resetForm();
      setAdding(false);
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not add contact",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, ProjectContact[]>();
    for (const c of contacts) {
      const key = c.role ?? "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [contacts]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!adding && (
          <Button
            onClick={() => setAdding(true)}
            className="bg-[#FFC72C] text-black hover:bg-[#FFB700]"
            data-testid="button-add-contact"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add contact
          </Button>
        )}
      </div>

      {adding && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">Name *</Label>
                <Input
                  id="contact-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Jane Doe"
                  data-testid="input-contact-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-job">Job title</Label>
                <Input
                  id="contact-job"
                  value={form.jobTitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, jobTitle: e.target.value }))
                  }
                  placeholder="Operations Manager"
                  data-testid="input-contact-job"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="jane@dnata.com"
                  data-testid="input-contact-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-mobile">Mobile</Label>
                <Input
                  id="contact-mobile"
                  value={form.mobile}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mobile: e.target.value }))
                  }
                  placeholder="+971 50 123 4567"
                  data-testid="input-contact-mobile"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-role">Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger
                    id="contact-role"
                    data-testid="select-contact-role"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Prefers email over phone; approves budgets above $50k."
                rows={2}
                data-testid="textarea-contact-notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  resetForm();
                  setAdding(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!form.name.trim()) {
                    toast({
                      title: "Name required",
                      variant: "destructive",
                    });
                    return;
                  }
                  addContact.mutate();
                }}
                disabled={addContact.isPending}
                className="bg-[#FFC72C] text-black hover:bg-[#FFB700]"
                data-testid="button-save-contact"
              >
                {addContact.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save contact"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contacts.length === 0 && !adding && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No contacts yet. Add the customer's primary contact to get started.
          </CardContent>
        </Card>
      )}

      <div className="space-y-5">
        {ROLE_ORDER.map((role) => {
          const list = grouped.get(role);
          if (!list || list.length === 0) return null;
          const roleLabel =
            ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
          return (
            <div key={role} className="space-y-2">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                {roleLabel}
              </h3>
              <div className="grid gap-2 md:grid-cols-2">
                {list.map((c) => (
                  <ContactCard key={c.id} contact={c} projectId={projectId} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContactCard({
  contact,
  projectId,
}: {
  contact: ProjectContact;
  projectId: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [`/api/projects/${projectId}/contacts`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/projects/${projectId}`],
    });
  };

  const updateRole = useMutation({
    mutationFn: async (role: string) => {
      const res = await apiRequest(
        `/api/project-contacts/${contact.id}`,
        "PATCH",
        { role },
      );
      return await res.json();
    },
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast({
        title: "Could not update role",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/project-contacts/${contact.id}`, "DELETE");
    },
    onSuccess: () => {
      toast({ title: "Contact removed" });
      invalidate();
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not delete",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground truncate">
              {contact.name}
            </div>
            {contact.jobTitle && (
              <div className="text-xs text-muted-foreground truncate">
                {contact.jobTitle}
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-1.5">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Mail className="h-3 w-3" />
                  {contact.email}
                </a>
              )}
              {contact.mobile && (
                <a
                  href={`tel:${contact.mobile}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {contact.mobile}
                </a>
              )}
            </div>
            {contact.notes && (
              <div className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">
                {contact.notes}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            data-testid={`button-delete-contact-${contact.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2">
          <Select
            value={contact.role ?? "other"}
            onValueChange={(v) => updateRole.mutate(v)}
          >
            <SelectTrigger
              className="h-8 text-xs"
              data-testid={`select-role-${contact.id}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {contact.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the contact from this project. Approval history
              referencing them is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContact.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Small reused avatar ────────────────────────────────────────────

function CustomerAvatar({
  name,
  logoUrl,
  size = 32,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        style={{ height: size, width: size }}
        className="rounded-full object-cover border border-border flex-shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      style={{ height: size, width: size }}
      className="rounded-full bg-[#FFC72C] flex items-center justify-center flex-shrink-0"
    >
      {initials ? (
        <span className="text-[11px] font-bold text-black">{initials}</span>
      ) : (
        <Building2 className="h-4 w-4 text-black" />
      )}
    </div>
  );
}

// ─── User avatar (person — not customer) ────────────────────────────

function UserAvatar({
  user,
  size = 36,
}: {
  user: Partial<CollaboratorUser> | null | undefined;
  size?: number;
}) {
  const name = formatUserName(user);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  if (user?.profileImageUrl) {
    return (
      <img
        src={user.profileImageUrl}
        alt={name}
        style={{ height: size, width: size }}
        className="rounded-full object-cover border border-border flex-shrink-0"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      style={{ height: size, width: size }}
      className="rounded-full bg-muted flex items-center justify-center flex-shrink-0 border border-border"
    >
      <span className="text-[11px] font-semibold text-foreground">
        {initials || "?"}
      </span>
    </div>
  );
}

// ─── Role badge ─────────────────────────────────────────────────────

function RoleBadge({ role }: { role: CollaboratorRole }) {
  if (role === "owner") {
    return (
      <Badge className="bg-[#FFC72C] text-black hover:bg-[#FFC72C] text-[10px] px-2 py-0">
        Owner
      </Badge>
    );
  }
  if (role === "editor") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-2 py-0 bg-green-50 text-green-800 border-green-300"
      >
        Editor
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-2 py-0 text-muted-foreground border-border"
    >
      Viewer
    </Badge>
  );
}

// ─── Team section ───────────────────────────────────────────────────

function TeamSection({
  projectId,
  projectName,
  ownerUserId,
}: {
  projectId: string;
  projectName: string;
  ownerUserId: string;
}) {
  const { user: currentUser } = useAuth();
  const currentUserId =
    (currentUser as { id?: string } | null | undefined)?.id ?? null;

  const { data: collaborators = [], isLoading } = useQuery<Collaborator[]>({
    queryKey: [`/api/projects/${projectId}/collaborators`],
  });

  const [addOpen, setAddOpen] = useState(false);

  // Current user's effective role on this project. Owner implicit from
  // the project record; otherwise pull from collaborators.
  const myRole: CollaboratorRole | null = useMemo(() => {
    if (!currentUserId) return null;
    if (currentUserId === ownerUserId) return "owner";
    const row = collaborators.find((c) => c.userId === currentUserId);
    return row ? row.role : null;
  }, [collaborators, currentUserId, ownerUserId]);

  const canManage = myRole === "owner" || myRole === "editor";

  // Count owners (including the implicit project owner row) — used to
  // block removing the last owner.
  const ownerCount = useMemo(() => {
    const owners = new Set<string>();
    owners.add(ownerUserId);
    for (const c of collaborators) if (c.role === "owner") owners.add(c.userId);
    return owners.size;
  }, [collaborators, ownerUserId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Team</h2>
        <Button
          onClick={() => setAddOpen(true)}
          disabled={!canManage}
          className="bg-[#FFC72C] text-black hover:bg-[#FFB700] disabled:opacity-50"
          data-testid="button-add-collaborator"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add collaborator
        </Button>
      </div>

      {/* Owner row is always rendered, ahead of collaborator rows. */}
      <div className="space-y-2">
        <OwnerRow
          projectId={projectId}
          ownerUserId={ownerUserId}
          isCurrentUser={currentUserId === ownerUserId}
          collaborators={collaborators}
        />

        {collaborators.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-full bg-muted p-3">
                  <UserPlus className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No teammates yet. Add a collaborator to populate this
                  project together.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          collaborators.map((c) => (
            <CollaboratorRow
              key={c.id}
              projectId={projectId}
              collaborator={c}
              isCurrentUser={c.userId === currentUserId}
              canManage={canManage}
              ownerCount={ownerCount}
            />
          ))
        )}
      </div>

      <AddCollaboratorModal
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        projectName={projectName}
      />
    </div>
  );
}

// ─── Owner row (implicit, always present, read-only) ────────────────

function OwnerRow({
  ownerUserId,
  isCurrentUser,
  collaborators,
}: {
  projectId: string;
  ownerUserId: string;
  isCurrentUser: boolean;
  collaborators: Collaborator[];
}) {
  // Try to get the owner's user detail piggybacked on a collaborator row
  // (if the server happens to include them). Otherwise render minimal.
  const embedded = collaborators.find((c) => c.userId === ownerUserId);
  const { user: currentUser } = useAuth();
  const meUser = isCurrentUser
    ? (currentUser as Partial<CollaboratorUser> | null | undefined)
    : null;
  const displayUser: Partial<CollaboratorUser> =
    embedded?.user ??
    meUser ??
    ({ id: ownerUserId, firstName: null, lastName: null, email: null, profileImageUrl: null });

  return (
    <Card data-testid={`collaborator-row-${ownerUserId}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <UserAvatar user={displayUser} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground truncate">
                {formatUserName(displayUser)}
                {isCurrentUser && (
                  <span className="ml-1 text-muted-foreground font-normal">
                    (You)
                  </span>
                )}
              </span>
              <RoleBadge role="owner" />
            </div>
            {displayUser.email && (
              <div className="text-xs text-muted-foreground truncate">
                {displayUser.email}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Project owner
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground pr-1">
              Read-only
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Collaborator row ───────────────────────────────────────────────

function CollaboratorRow({
  projectId,
  collaborator,
  isCurrentUser,
  canManage,
  ownerCount,
}: {
  projectId: string;
  collaborator: Collaborator;
  isCurrentUser: boolean;
  canManage: boolean;
  ownerCount: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: [`/api/projects/${projectId}/collaborators`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/projects/${projectId}`],
    });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
  };

  const updateRole = useMutation({
    mutationFn: async (role: CollaboratorRole) => {
      const res = await apiRequest(
        `/api/projects/${projectId}/collaborators/${collaborator.id}`,
        "PATCH",
        { role },
      );
      return (await res.json()) as Collaborator;
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not update role",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const removeCollaborator = useMutation({
    mutationFn: async () => {
      await apiRequest(
        `/api/projects/${projectId}/collaborators/${collaborator.id}`,
        "DELETE",
      );
    },
    onSuccess: () => {
      toast({
        title: `${formatUserName(collaborator.user)} removed`,
      });
      invalidateAll();
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not remove",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const disabledControls = isCurrentUser || !canManage;
  const name = formatUserName(collaborator.user);

  const handleRoleChange = (next: string) => {
    if (next === collaborator.role) return;
    updateRole.mutate(next as CollaboratorRole);
  };

  const handleRemoveClick = () => {
    // Guard: don't let the last owner be removed.
    if (collaborator.role === "owner" && ownerCount <= 1) {
      toast({
        title: "A project must have at least one owner",
        variant: "destructive",
      });
      return;
    }
    setConfirmRemove(true);
  };

  const invitedByName = collaborator.invitedBy ? "a teammate" : null;
  const invitedDate = formatInviteDate(collaborator.invitedAt);

  return (
    <Card data-testid={`collaborator-row-${collaborator.userId}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <UserAvatar user={collaborator.user} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground truncate">
                {name}
                {isCurrentUser && (
                  <span className="ml-1 text-muted-foreground font-normal">
                    (You)
                  </span>
                )}
              </span>
              <RoleBadge role={collaborator.role} />
            </div>
            {collaborator.user.email && (
              <div className="text-xs text-muted-foreground truncate">
                {collaborator.user.email}
              </div>
            )}
            {(invitedByName || invitedDate) && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Invited{invitedByName ? ` by ${invitedByName}` : ""}
                {invitedDate ? ` · ${invitedDate}` : ""}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[120px]">
              <Select
                value={collaborator.role}
                onValueChange={handleRoleChange}
                disabled={disabledControls}
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  data-testid={`select-role-${collaborator.userId}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRemoveClick}
              disabled={disabledControls || removeCollaborator.isPending}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
              data-testid={`button-remove-collaborator-${collaborator.userId}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {collaborator.role === "owner" && !disabledControls && (
          <div className="mt-2 text-[11px] text-muted-foreground pl-12">
            Grants full control including team management.
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name} from this project?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access immediately. You can re-add them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeCollaborator.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Add collaborator modal ─────────────────────────────────────────

function AddCollaboratorModal({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  projectName: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [selectedUser, setSelectedUser] = useState<SearchableUser | null>(null);
  const [role, setRole] = useState<CollaboratorRole>("editor");

  // Reset state each time the modal re-opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedUser(null);
      setRole("editor");
    }
  }, [open]);

  const { data: results = [], isFetching } = useQuery<SearchableUser[]>({
    queryKey: [
      `/api/users/searchable`,
      debouncedQuery,
      projectId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      params.set("projectId", projectId);
      const res = await fetch(
        `/api/users/searchable?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return (await res.json()) as SearchableUser[];
    },
    enabled: open,
    staleTime: 15_000,
  });

  const visibleResults = results.slice(0, 20);

  const addCollaborator = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("Pick a user first");
      const res = await apiRequest(
        `/api/projects/${projectId}/collaborators`,
        "POST",
        { userId: selectedUser.id, role },
      );
      return (await res.json()) as Collaborator;
    },
    onSuccess: () => {
      toast({
        title: selectedUser
          ? `${formatUserName(selectedUser)} added`
          : "Collaborator added",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}/collaborators`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/projects/${projectId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not add collaborator",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add teammate to {projectName}</DialogTitle>
          <DialogDescription>
            Search for someone in your organisation and grant them access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-8"
              autoFocus
              data-testid="input-collaborator-search"
            />
          </div>

          <div className="border border-border rounded-md max-h-64 overflow-y-auto divide-y divide-border">
            {isFetching ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : visibleResults.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6 px-3">
                {debouncedQuery.trim()
                  ? "No matches — try a different name or email."
                  : "Start typing to search for a teammate."}
              </div>
            ) : (
              visibleResults.map((u) => {
                const active = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 p-2.5 transition-colors",
                      active
                        ? "bg-[#FFC72C]/20"
                        : "hover:bg-muted/60",
                    )}
                    data-testid={`collaborator-search-result-${u.id}`}
                  >
                    <UserAvatar user={u} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {formatUserName(u)}
                      </div>
                      {u.email && (
                        <div className="text-xs text-muted-foreground truncate">
                          {u.email}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedUser && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Role for {formatUserName(selectedUser)}
              </Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as CollaboratorRole)}
              >
                <SelectTrigger data-testid="select-new-collaborator-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              {role === "owner" && (
                <div className="text-[11px] text-muted-foreground">
                  Grants full control including team management.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={addCollaborator.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => addCollaborator.mutate()}
            disabled={!selectedUser || addCollaborator.isPending}
            className="bg-[#FFC72C] text-black hover:bg-[#FFB700]"
            data-testid="button-submit-collaborator"
          >
            {addCollaborator.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Add to project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
