import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Edit3,
  Loader2,
  Mail,
  Phone,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Simple, permissive email regex — same vibe as input[type=email]
// validation. Rejects obvious typos but doesn't try to be RFC-strict.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (s: string) => EMAIL_RE.test(s.trim());

// Per-session dismissal key so the empty-state callout doesn't nag
// once the operator has acknowledged it.
const CALLOUT_DISMISS_KEY = "install-teams.contact-email-callout.dismissed";

interface InstallTeam {
  id: string;
  name: string;
  region: string | null;
  leadContactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  capacityJobsPerWeek: number | null;
  colour: string | null;
  active: boolean;
  notes: string | null;
}

interface InstallTeamMember {
  id: string;
  teamId: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleInTeam: string | null;
  certifications: any;
  active: boolean;
}

const DEFAULT_TEAMS = [
  {
    name: "UAE North",
    region: "UAE North",
    leadContactName: "Ali Al Mansoori",
    contactEmail: "north@example.ae",
    capacityJobsPerWeek: 3,
    colour: "#0ea5e9",
  },
  {
    name: "UAE South",
    region: "UAE South",
    leadContactName: "Omar Al Hashimi",
    contactEmail: "south@example.ae",
    capacityJobsPerWeek: 2,
    colour: "#22c55e",
  },
];

export default function InstallTeams() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: teams = [], isLoading } = useQuery<InstallTeam[]>({
    queryKey: ["/api/install-teams"],
  });

  const [editing, setEditing] = useState<InstallTeam | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [didSeed, setDidSeed] = useState(false);

  // Self-seed on first view: if the org has no teams at all, bootstrap
  // with two example teams so the installation timeline feature is
  // useful immediately. Tracked via didSeed so we don't attempt twice
  // within a session.
  useEffect(() => {
    if (isLoading || didSeed) return;
    if (teams.length > 0) return;
    setDidSeed(true);
    (async () => {
      try {
        for (const t of DEFAULT_TEAMS) {
          await apiRequest("/api/install-teams", "POST", t);
        }
        qc.invalidateQueries({ queryKey: ["/api/install-teams"] });
      } catch {
        // Non-fatal — the user can add teams manually.
      }
    })();
  }, [isLoading, teams.length, didSeed, qc]);

  const create = useMutation({
    mutationFn: async (body: Partial<InstallTeam>) => {
      const res = await apiRequest("/api/install-teams", "POST", body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/install-teams"] });
      setShowCreate(false);
      toast({ title: "Team created" });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<InstallTeam> }) => {
      const res = await apiRequest(`/api/install-teams/${id}`, "PATCH", body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/install-teams"] });
      setEditing(null);
      toast({ title: "Team updated" });
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/installation-timeline"
            className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Installation Timeline
          </Link>
          <h1 className="text-3xl font-bold text-[#FFC72C] mt-1">Install Teams</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            External installation crews used to execute installation projects.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#FFC72C] hover:bg-[#FFB300] text-black"
          data-testid="btn-new-team"
        >
          <Plus className="h-4 w-4 mr-2" />
          New team
        </Button>
      </div>

      <MissingEmailCallout teams={teams} />

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Loading teams…</CardContent>
        </Card>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Users className="h-10 w-10 mx-auto text-muted-foreground" />
            <div className="font-medium">No teams yet</div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Add your first external install crew. Teams get assigned to installations and
              appear in the team capacity calendar.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} onEdit={() => setEditing(team)} />
          ))}
        </div>
      )}

      <TeamDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={(body) => create.mutate(body)}
      />
      <TeamDialog
        open={!!editing}
        team={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSubmit={(body) => editing && update.mutate({ id: editing.id, body })}
      />
    </div>
  );
}

function TeamCard({ team, onEdit }: { team: InstallTeam; onEdit: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: members = [] } = useQuery<InstallTeamMember[]>({
    queryKey: [`/api/install-teams/${team.id}/members`],
  });

  const [showAddMember, setShowAddMember] = useState(false);

  const addMember = useMutation({
    mutationFn: async (body: Partial<InstallTeamMember>) => {
      const res = await apiRequest(`/api/install-teams/${team.id}/members`, "POST", body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/install-teams/${team.id}/members`] });
      setShowAddMember(false);
      toast({ title: "Member added" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/install-team-members/${id}`, "DELETE");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/install-teams/${team.id}/members`] }),
  });

  const softDelete = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/install-teams/${team.id}`, "DELETE");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/install-teams"] }),
  });

  const swatch = team.colour || "#d1d5db";

  return (
    <Card className={team.active ? "" : "opacity-60"}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block h-4 w-4 rounded-full shrink-0"
              style={{ background: swatch }}
            />
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{team.name}</CardTitle>
              {team.region && <CardDescription>{team.region}</CardDescription>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm space-y-1">
          {team.leadContactName && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {team.leadContactName}
            </div>
          )}
          {team.contactPhone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {team.contactPhone}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Capacity: {team.capacityJobsPerWeek ?? 3} jobs/wk
          </div>
          {!team.active && (
            <Badge variant="secondary" className="text-xs">
              Inactive
            </Badge>
          )}
        </div>

        <ContactEmailEditor team={team} />

        <div className="pt-3 border-t">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-muted-foreground">
              Members ({members.length})
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowAddMember(true)}>
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1">
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground">No members yet.</p>
            ) : (
              members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between text-sm border rounded px-2 py-1"
                >
                  <div className="min-w-0">
                    <div className="truncate">{m.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.roleInTeam || "—"}
                      {m.email ? ` · ${m.email}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => removeMember.mutate(m.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-3 border-t flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={() => softDelete.mutate()}
            disabled={!team.active}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Deactivate
          </Button>
        </div>
      </CardContent>

      <MemberDialog
        open={showAddMember}
        onOpenChange={setShowAddMember}
        onSubmit={(body) => addMember.mutate(body)}
      />
    </Card>
  );
}

function TeamDialog({
  open,
  team,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  team?: InstallTeam | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (body: Partial<InstallTeam>) => void;
}) {
  const [name, setName] = useState(team?.name || "");
  const [region, setRegion] = useState(team?.region || "");
  const [leadContactName, setLead] = useState(team?.leadContactName || "");
  const [contactEmail, setEmail] = useState(team?.contactEmail || "");
  const [contactPhone, setPhone] = useState(team?.contactPhone || "");
  const [capacityJobsPerWeek, setCapacity] = useState<number>(team?.capacityJobsPerWeek ?? 3);
  const [colour, setColour] = useState(team?.colour || "#0ea5e9");
  const [notes, setNotes] = useState(team?.notes || "");
  const [active, setActive] = useState<boolean>(team?.active ?? true);

  useEffect(() => {
    if (open) {
      setName(team?.name || "");
      setRegion(team?.region || "");
      setLead(team?.leadContactName || "");
      setEmail(team?.contactEmail || "");
      setPhone(team?.contactPhone || "");
      setCapacity(team?.capacityJobsPerWeek ?? 3);
      setColour(team?.colour || "#0ea5e9");
      setNotes(team?.notes || "");
      setActive(team?.active ?? true);
    }
  }, [open, team]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "New install team"}</DialogTitle>
          <DialogDescription>
            External install crews. Used to schedule and plan installation projects.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-team-name" />
          </div>
          <div>
            <Label>Region</Label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div>
            <Label>Capacity (jobs/wk)</Label>
            <Input
              type="number"
              min={0}
              value={capacityJobsPerWeek}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Lead contact</Label>
            <Input value={leadContactName} onChange={(e) => setLead(e.target.value)} />
          </div>
          <div>
            <Label>Colour</Label>
            <Input type="color" value={colour} onChange={(e) => setColour(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={contactEmail} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={contactPhone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          {team && (
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="team-active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <Label htmlFor="team-active">Active</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) return;
              onSubmit({
                name: name.trim(),
                region: region || null,
                leadContactName: leadContactName || null,
                contactEmail: contactEmail || null,
                contactPhone: contactPhone || null,
                capacityJobsPerWeek,
                colour,
                notes: notes || null,
                ...(team ? { active } : {}),
              });
            }}
            className="bg-[#FFC72C] hover:bg-[#FFB300] text-black"
            data-testid="btn-submit-team"
          >
            {team ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (body: Partial<InstallTeamMember>) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleInTeam, setRole] = useState("");

  useEffect(() => {
    if (!open) {
      setName("");
      setEmail("");
      setPhone("");
      setRole("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Role</Label>
            <Input
              placeholder="lead / installer / apprentice / safety"
              value={roleInTeam}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) return;
              onSubmit({
                name: name.trim(),
                email: email || null,
                phone: phone || null,
                roleInTeam: roleInTeam || null,
              });
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ContactEmailEditor ────────────────────────────────────────────
//
// Inline-edit row for install_teams.contact_email + chip showing
// configured/missing state + "Send test" button. Save on blur (only
// if changed and valid). Empty string clears the email (server stores
// null via the existing PATCH /api/install-teams/:id endpoint).
function ContactEmailEditor({ team }: { team: InstallTeam }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [value, setValue] = useState<string>(team.contactEmail || "");

  // Re-sync local state when the upstream record changes (e.g. another
  // tab/edit-dialog updates the team).
  useEffect(() => {
    setValue(team.contactEmail || "");
  }, [team.contactEmail]);

  const save = useMutation({
    mutationFn: async (next: string | null) => {
      const res = await apiRequest(`/api/install-teams/${team.id}`, "PATCH", {
        contactEmail: next,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/install-teams"] });
      toast({ title: "Contact email saved" });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    },
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        `/api/install-teams/${team.id}/test-email`,
        "POST",
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.ok && data?.sent) {
        toast({
          title: "Test sent",
          description: `Delivered to ${data.recipient} (${data.videoCount ?? 0} videos, ${data.productCount ?? 0} products).`,
        });
      } else {
        toast({
          title: "Test not sent",
          description: data?.reason || data?.message || "Resend declined.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Test failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    },
  });

  const trimmed = value.trim();
  const original = team.contactEmail || "";
  const dirty = trimmed !== original;
  const empty = trimmed.length === 0;
  const validNow = empty || isValidEmail(trimmed);

  const handleBlur = () => {
    if (!dirty) return;
    if (empty) {
      save.mutate(null);
      return;
    }
    if (!isValidEmail(trimmed)) {
      toast({
        title: "Invalid email",
        description: `"${trimmed}" doesn't look like a valid email address.`,
        variant: "destructive",
      });
      return;
    }
    save.mutate(trimmed);
  };

  const configured = !!team.contactEmail;

  return (
    <div className="pt-3 border-t space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          Contact email
        </div>
        {configured ? (
          <Badge
            className="bg-green-100 text-green-800 hover:bg-green-100 text-[10px] font-medium"
            data-testid={`chip-email-configured-${team.id}`}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Email configured
          </Badge>
        ) : (
          <Badge
            className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] font-medium"
            data-testid={`chip-email-missing-${team.id}`}
          >
            <AlertTriangle className="h-3 w-3 mr-1" />
            No email — digests skipped
          </Badge>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="lead@example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setValue(original);
            }
          }}
          aria-invalid={!validNow}
          className={
            !validNow
              ? "border-red-400 focus-visible:ring-red-400 text-sm h-8"
              : "text-sm h-8"
          }
          data-testid={`input-team-email-${team.id}`}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={!configured || sendTest.isPending || dirty}
          onClick={() => sendTest.mutate()}
          title={
            !configured
              ? "Set a contact email first"
              : dirty
                ? "Save the email change first (blur the field)"
                : "Send a test install-video digest to this team"
          }
          data-testid={`btn-send-test-${team.id}`}
        >
          {sendTest.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 text-xs">Send test</span>
        </Button>
      </div>
      {!validNow && (
        <p className="text-[11px] text-red-600">
          Enter a valid email address (e.g. lead@example.com).
        </p>
      )}
      {save.isPending && (
        <p className="text-[11px] text-muted-foreground">Saving…</p>
      )}
    </div>
  );
}

// ─── MissingEmailCallout ───────────────────────────────────────────
//
// Top-of-page nudge: counts teams without a contact_email and warns
// that those teams will be silently skipped by the auto-digest. Per-
// session dismiss (localStorage) so it stops nagging once Sagarika
// has clocked it.
function MissingEmailCallout({ teams }: { teams: InstallTeam[] }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" &&
        window.localStorage.getItem(CALLOUT_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const missing = useMemo(
    () => teams.filter((t) => t.active && !(t.contactEmail || "").trim()).length,
    [teams],
  );

  if (dismissed) return null;
  if (missing === 0) return null;

  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 flex items-start gap-3"
      data-testid="callout-missing-email"
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
      <div className="text-sm flex-1">
        <span className="font-medium">
          {missing} team{missing === 1 ? "" : "s"} have no contact email
        </span>
        {" — install-video digests will skip them. Add an email to enable notifications."}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-amber-900 hover:bg-amber-100"
        onClick={() => {
          try {
            window.localStorage.setItem(CALLOUT_DISMISS_KEY, "1");
          } catch {
            /* localStorage may be disabled — non-fatal */
          }
          setDismissed(true);
        }}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
