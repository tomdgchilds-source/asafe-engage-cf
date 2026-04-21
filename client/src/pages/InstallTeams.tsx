import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Edit3,
  Mail,
  Phone,
  Plus,
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
          {team.contactEmail && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              {team.contactEmail}
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
