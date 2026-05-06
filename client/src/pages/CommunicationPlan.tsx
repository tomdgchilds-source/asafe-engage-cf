// ──────────────────────────────────────────────────────────────────────
// CommunicationPlan.tsx
//
// Two-tab dashboard:
//   1. Templates  — browse the curated library grouped by scenario.
//                   Render any template against the rep's active project,
//                   then ship it via WhatsApp deeplink or email.
//   2. Pending    — trigger-driven suggestions queued by the daily scanner
//                   (see worker/scheduled/commSuggestionsScanner.ts).
//                   Always require rep click-to-approve. NEVER auto-send.
// ──────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useActiveProject } from "@/hooks/useActiveProject";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Copy,
  MessageSquare,
  Mail,
  CheckCircle2,
  XCircle,
  Bell,
  ClipboardCheck,
  RefreshCw,
  Send,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────

type CommChannel = "whatsapp" | "email" | "both";

interface CommTemplate {
  id: string;
  scenario: string;
  title: string;
  channel: CommChannel;
  subject: string | null;
  body: string;
  trigger_event: string | null;
  trigger_offset_days: number | null;
  is_active: boolean;
}

interface CommSuggestion {
  id: string;
  project_id: string | null;
  template_id: string | null;
  suggested_at: string;
  due_at: string | null;
  status: "pending" | "sent" | "dismissed";
  rendered_body: string | null;
  rendered_subject: string | null;
  rep_user_id: string | null;
  scenario: string | null;
  title: string | null;
  channel: CommChannel | null;
  template_subject: string | null;
  project_name: string | null;
  customer_company_name: string | null;
}

interface RenderedTemplate {
  id: string;
  scenario: string;
  title: string;
  channel: CommChannel;
  subject: string | null;
  body: string;
  placeholders: Record<string, string>;
  projectId: string | null;
}

// ─── Scenario labels — mirrors shared/commTemplates.ts ────────────────

const SCENARIO_LABELS: Record<string, { label: string; description: string }> = {
  "discovery": {
    label: "Discovery",
    description: "First-meeting follow-up with observational survey report",
  },
  "site-survey-scheduling": {
    label: "Site survey scheduling",
    description: "Set up a site survey at the customer's facility",
  },
  "site-survey-complete": {
    label: "Site survey complete",
    description: "Hand over the observational impact protection survey report",
  },
  "quote-sent": {
    label: "Quote sent",
    description: "Initial quote delivery with budgetary number",
  },
  "quote-followup-3": {
    label: "Quote follow-up — 3 days",
    description: "Light-touch chase three days after sending",
  },
  "quote-followup-7": {
    label: "Quote follow-up — 7 days",
    description: "Mid-cycle check-in with revision options",
  },
  "quote-followup-14": {
    label: "Quote follow-up — 14 days",
    description: "Two-week chaser — re-engage or extend the quote",
  },
  "order-confirmation": {
    label: "Order confirmation",
    description: "Thank you + here's what happens next",
  },
  "pre-installation": {
    label: "Pre-installation",
    description: "Site readiness checklist five days before install",
  },
  "post-installation": {
    label: "Post-installation",
    description: "Snag list + sign-off form after the install completes",
  },
  "review-request": {
    label: "Customer review request",
    description: "Google review or LinkedIn testimonial ask",
  },
  "reciprocal-commitment": {
    label: "Reciprocal value commitment",
    description: "Reminder for the case-study / video promised at pricing",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────

// Format a phone number for the wa.me deeplink: strip everything that
// isn't a digit so "+971 50 123 4567" becomes "971501234567".
function digitsOnly(phone: string | null | undefined): string {
  return (phone || "").replace(/\D/g, "");
}

function buildWhatsappLink(phone: string, message: string): string {
  return `https://wa.me/${digitsOnly(phone)}?text=${encodeURIComponent(message)}`;
}

function buildMailtoLink(
  email: string,
  subject: string | null,
  body: string,
): string {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  params.set("body", body);
  return `mailto:${encodeURIComponent(email)}?${params.toString()}`;
}

// Strip the basic markdown emphasis the email path uses so the WhatsApp /
// clipboard preview reads cleanly. Mirrors renderTemplate(channel="whatsapp")
// in shared/commTemplates.ts so previews and sends agree.
function plainText(body: string): string {
  return body
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^# +/gm, "")
    .replace(/^## +/gm, "")
    .trim();
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function CommunicationPlan() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeProject } = useActiveProject();
  const [selectedTemplate, setSelectedTemplate] = useState<CommTemplate | null>(null);
  const [rendered, setRendered] = useState<RenderedTemplate | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(
    null,
  );

  const { data: templates = [], isLoading: templatesLoading } = useQuery<
    CommTemplate[]
  >({
    queryKey: ["/api/communication/templates"],
  });

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<
    CommSuggestion[]
  >({
    queryKey: ["/api/communication/suggestions"],
  });

  // Group templates by scenario for the card layout.
  const grouped = useMemo(() => {
    const m = new Map<string, CommTemplate[]>();
    for (const t of templates) {
      const key = t.scenario;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [templates]);

  // Open the compose dialog for a template — fetch the rendered body
  // against the active project so placeholders are filled before the
  // rep sees the preview.
  async function openTemplate(tmpl: CommTemplate) {
    setSelectedTemplate(tmpl);
    setRendered(null);
    setEditedBody(tmpl.body);
    setEditedSubject(tmpl.subject || "");

    // Pre-fill recipient fields from the active project's primary contact.
    const contact = (activeProject?.contacts || [])[0];
    setRecipientPhone(contact?.mobile || "");
    setRecipientEmail(contact?.email || "");

    try {
      const projectId = activeProject?.id || "";
      const url = `/api/communication/templates/${tmpl.id}/render${projectId ? `?projectId=${projectId}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as RenderedTemplate;
      setRendered(data);
      setEditedBody(data.body);
      setEditedSubject(data.subject || "");
    } catch (err) {
      toast({
        title: "Could not render template",
        description:
          "We'll show the raw template — variables may not be filled in.",
        variant: "destructive",
      });
    }
  }

  // Open the compose dialog for an existing pending suggestion.
  function openSuggestion(s: CommSuggestion) {
    if (!s.template_id || !s.title) {
      toast({
        title: "Suggestion missing template",
        description: "The original template was deleted — dismiss this one.",
        variant: "destructive",
      });
      return;
    }
    const tmpl: CommTemplate = {
      id: s.template_id,
      scenario: s.scenario || "unknown",
      title: s.title,
      channel: (s.channel as CommChannel) || "whatsapp",
      subject: s.template_subject,
      body: s.rendered_body || "",
      trigger_event: null,
      trigger_offset_days: null,
      is_active: true,
    };
    setSelectedTemplate(tmpl);
    setRendered({
      id: tmpl.id,
      scenario: tmpl.scenario,
      title: tmpl.title,
      channel: tmpl.channel,
      subject: s.rendered_subject,
      body: s.rendered_body || "",
      placeholders: {},
      projectId: s.project_id,
    });
    setEditedBody(s.rendered_body || "");
    setEditedSubject(s.rendered_subject || "");
    setActiveSuggestionId(s.id);

    const contact = (activeProject?.contacts || [])[0];
    setRecipientPhone(contact?.mobile || "");
    setRecipientEmail(contact?.email || "");
  }

  function closeDialog() {
    setSelectedTemplate(null);
    setRendered(null);
    setEditedBody("");
    setEditedSubject("");
    setActiveSuggestionId(null);
  }

  async function handleCopy() {
    const text = plainText(editedBody);
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({
        title: "Copy failed",
        description: "Browser blocked clipboard access — select and copy manually.",
        variant: "destructive",
      });
    }
  }

  function handleOpenWhatsapp() {
    if (!recipientPhone) {
      toast({
        title: "Phone number required",
        description: "Add the customer's mobile to open WhatsApp.",
        variant: "destructive",
      });
      return;
    }
    const link = buildWhatsappLink(recipientPhone, plainText(editedBody));
    window.open(link, "_blank", "noopener,noreferrer");
    toast({
      title: "WhatsApp opened",
      description: "Review and tap send. Then mark this suggestion as sent.",
    });
  }

  function handleOpenEmail() {
    if (!recipientEmail) {
      toast({
        title: "Email address required",
        description: "Add the customer's email to open your mail client.",
        variant: "destructive",
      });
      return;
    }
    const link = buildMailtoLink(
      recipientEmail,
      editedSubject || selectedTemplate?.title || "Hello",
      editedBody,
    );
    window.open(link, "_blank");
    toast({
      title: "Email client opened",
      description: "Review and send. Then mark this suggestion as sent.",
    });
  }

  async function markSuggestionSent() {
    if (!activeSuggestionId) {
      closeDialog();
      return;
    }
    try {
      await apiRequest(
        `/api/communication/suggestions/${activeSuggestionId}/sent`,
        "POST",
      );
      toast({ title: "Marked as sent" });
      qc.invalidateQueries({ queryKey: ["/api/communication/suggestions"] });
      closeDialog();
    } catch (err: any) {
      toast({
        title: "Failed to mark sent",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    }
  }

  async function dismissSuggestion(id: string) {
    try {
      await apiRequest(
        `/api/communication/suggestions/${id}/dismiss`,
        "POST",
      );
      toast({ title: "Suggestion dismissed" });
      qc.invalidateQueries({ queryKey: ["/api/communication/suggestions"] });
    } catch (err: any) {
      toast({
        title: "Dismiss failed",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-[#FFC72C]">Communication Plan</h1>
          <p className="text-muted-foreground mt-1">
            Pre-written templates and trigger-based suggestions for customer comms.
            Every send still requires your click-to-approve.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="gap-1">
            <ClipboardCheck className="h-3 w-3" />
            {templates.length} templates
          </Badge>
          <Badge
            variant={suggestions.length > 0 ? "destructive" : "secondary"}
            className="gap-1"
          >
            <Bell className="h-3 w-3" />
            {suggestions.length} pending
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="templates">
            <ClipboardCheck className="h-4 w-4 mr-2" /> Templates
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            <Bell className="h-4 w-4 mr-2" /> Pending suggestions
            {suggestions.length > 0 && (
              <Badge
                variant="destructive"
                className="ml-2 h-5 min-w-[1.2rem] px-1.5 text-[10px]"
              >
                {suggestions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ───── Templates tab ───── */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          {templatesLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading templates…
              </CardContent>
            </Card>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p className="mb-4">No templates seeded yet.</p>
                <p className="text-sm">
                  Run the migration endpoint{" "}
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    POST /api/admin/apply-comm-templates-schema
                  </code>{" "}
                  to seed the defaults.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from(grouped.entries()).map(([scenario, items]) => {
                const meta = SCENARIO_LABELS[scenario] || {
                  label: scenario,
                  description: "",
                };
                return (
                  <Card key={scenario} className="flex flex-col">
                    <CardHeader>
                      <CardTitle className="text-base">{meta.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {meta.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-2">
                      {items.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-card hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {t.title}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 h-4"
                              >
                                {t.channel}
                              </Badge>
                              {t.trigger_event && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] py-0 h-4"
                                >
                                  auto
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-[#FFC72C] hover:bg-[#FFB700] text-black h-8"
                            onClick={() => openTemplate(t)}
                            data-testid={`template-open-${t.scenario}`}
                          >
                            Use
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ───── Pending suggestions tab ───── */}
        <TabsContent value="suggestions" className="mt-4 space-y-4">
          {suggestionsLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading suggestions…
              </CardContent>
            </Card>
          ) : suggestions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-green-500" />
                <p>No pending suggestions. You're all caught up.</p>
                <p className="text-xs mt-2">
                  The daily scanner runs at 06:00 UTC and queues messages
                  triggered by project events (site survey complete, quote sent,
                  install scheduled, etc).
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s) => {
                const meta = s.scenario
                  ? SCENARIO_LABELS[s.scenario] || {
                      label: s.scenario,
                      description: "",
                    }
                  : { label: "Suggestion", description: "" };
                const dueAt = s.due_at ? new Date(s.due_at) : null;
                const overdue = dueAt && dueAt < new Date();
                return (
                  <Card key={s.id} data-testid={`suggestion-${s.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            {s.title || meta.label}
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 h-4"
                            >
                              {s.channel || "whatsapp"}
                            </Badge>
                            {overdue && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] py-0 h-4"
                              >
                                overdue
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {s.project_name && (
                              <>
                                <strong>{s.project_name}</strong>
                                {s.customer_company_name && (
                                  <> · {s.customer_company_name}</>
                                )}
                                <> · </>
                              </>
                            )}
                            Due{" "}
                            {dueAt
                              ? dueAt.toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "now"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap mb-3">
                        {s.rendered_body || ""}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-[#FFC72C] hover:bg-[#FFB700] text-black"
                          onClick={() => openSuggestion(s)}
                          data-testid={`suggestion-review-${s.id}`}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          Review and send
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => dismissSuggestion(s.id)}
                          data-testid={`suggestion-dismiss-${s.id}`}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ───── Compose dialog ───── */}
      <Dialog
        open={!!selectedTemplate}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.title}</DialogTitle>
            <DialogDescription>
              {activeProject?.name ? (
                <>
                  Active project: <strong>{activeProject.name}</strong>
                  {(activeProject as any).customerCompany?.name && (
                    <> · {(activeProject as any).customerCompany.name}</>
                  )}
                </>
              ) : (
                "No active project — placeholders may render as {{tokens}}."
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate?.channel !== "whatsapp" && (
            <div>
              <Label htmlFor="comm-subject" className="text-xs">
                Subject (email)
              </Label>
              <Input
                id="comm-subject"
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          <div>
            <Label htmlFor="comm-body" className="text-xs">
              Message body
            </Label>
            <Textarea
              id="comm-body"
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              className="min-h-[260px] font-mono text-sm mt-1"
              data-testid="comm-edit-body"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="comm-phone" className="text-xs">
                Recipient phone (WhatsApp)
              </Label>
              <Input
                id="comm-phone"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+971 50 123 4567"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="comm-email" className="text-xs">
                Recipient email
              </Label>
              <Input
                id="comm-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="contact@example.com"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleCopy}
              data-testid="comm-copy"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenWhatsapp}
              disabled={!recipientPhone}
              data-testid="comm-whatsapp"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Open WhatsApp
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenEmail}
              disabled={!recipientEmail}
              data-testid="comm-email"
            >
              <Mail className="h-4 w-4 mr-2" />
              Open email
            </Button>
            {activeSuggestionId ? (
              <Button
                onClick={markSuggestionSent}
                className="bg-[#FFC72C] hover:bg-[#FFB700] text-black"
                data-testid="comm-mark-sent"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as sent
              </Button>
            ) : (
              <Button
                onClick={closeDialog}
                className="bg-[#FFC72C] hover:bg-[#FFB700] text-black"
              >
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
