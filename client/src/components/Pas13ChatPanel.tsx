// ────────────────────────────────────────────────────────────────────────────
// Pas13ChatPanel
//
// Slide-out RAG chat drawer for A-SAFE reps. Triggered by a compact "Ask
// PAS 13" button that can be mounted on the Layout Drawing tool, Impact
// Calculator, and Site Survey. Wraps POST /api/pas13/chat.
//
// Wording rule (hard): the UI surfaces "PAS 13 aligned / borderline /
// not aligned" — never "compliant". The rendered answer text itself is
// produced by the server pipeline which enforces the same rule.
//
// Gated to reps via GET /api/pas13/me. When isRep is false we render
// nothing (no button).
// ────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpenText,
  FileText,
  PlayCircle,
  Loader2,
  Send,
  MessageSquareText,
} from "lucide-react";

interface ChatCitation {
  type: "pdf" | "video";
  section?: string;
  page?: number;
  videoId?: string;
  videoTitle?: string;
  startSec?: number;
  url: string;
  label: string;
}

interface ChatResponse {
  mode: "l2" | "rag";
  answer: string;
  citations: ChatCitation[];
  latencyMs?: number;
  corpusLoadMs?: number | null;
  usage?: { inTokens: number; outTokens: number };
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  mode?: "l2" | "rag";
  latencyMs?: number;
}

export interface Pas13ChatPanelProps {
  /** Label the button should show — defaults to "Ask PAS 13". */
  buttonLabel?: string;
  /** Optional extra class on the trigger button. */
  buttonClassName?: string;
  /** When true, render a compact chip instead of a full button. */
  compact?: boolean;
}

export function Pas13ChatPanel({
  buttonLabel = "Ask PAS 13",
  buttonClassName = "",
  compact = false,
}: Pas13ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const scrollEnd = useRef<HTMLDivElement>(null);

  // Rep gate — /api/pas13/me returns { isRep: boolean }.
  const { data: gate } = useQuery<{ isRep: boolean }>({
    queryKey: ["/api/pas13/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (question: string): Promise<ChatResponse> => {
      const history = turns
        .slice(-6)
        .map((t) => ({ role: t.role, content: t.content }));
      const res = await apiRequest("/api/pas13/chat", "POST", {
        question,
        history,
      });
      return (await res.json()) as ChatResponse;
    },
    onSuccess: (data) => {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          citations: data.citations,
          mode: data.mode,
          latencyMs: data.latencyMs,
        },
      ]);
    },
    onError: (err: Error) => {
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry — the PAS 13 assistant hit an error. Please consult A-SAFE engineering. (" +
            (err?.message ?? "unknown") +
            ")",
          citations: [],
        },
      ]);
    },
  });

  useEffect(() => {
    if (open) scrollEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, open]);

  if (!gate?.isRep) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || mutation.isPending) return;
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setDraft("");
    mutation.mutate(q);
  };

  const triggerBtn = compact ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={`gap-1.5 ${buttonClassName}`}
      data-testid="pas13-chat-trigger"
    >
      <MessageSquareText className="h-3.5 w-3.5" />
      {buttonLabel}
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={`gap-2 ${buttonClassName}`}
      data-testid="pas13-chat-trigger"
    >
      <BookOpenText className="h-4 w-4" />
      {buttonLabel}
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{triggerBtn}</SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-lg"
        data-testid="pas13-chat-sheet"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <BookOpenText className="h-5 w-5 text-primary" />
            Ask PAS 13
          </SheetTitle>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Powered by PAS 13:2017 + A-SAFE PAS 13 video library. Indicative
            — verify with A-SAFE engineering.
          </p>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          {turns.length === 0 && (
            <EmptyState
              onPickExample={(q) => {
                setTurns((prev) => [...prev, { role: "user", content: q }]);
                mutation.mutate(q);
              }}
            />
          )}
          <div className="space-y-3">
            {turns.map((t, i) => (
              <ChatBubble key={i} turn={t} />
            ))}
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Looking through PAS 13 + video library…
              </div>
            )}
            <div ref={scrollEnd} />
          </div>
        </ScrollArea>

        <form
          onSubmit={onSubmit}
          className="flex items-end gap-2 border-t px-3 py-3"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. What's the min post centre for a 5 t forklift at 22.5°?"
            className="flex-1"
            disabled={mutation.isPending}
            data-testid="pas13-chat-input"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!draft.trim() || mutation.isPending}
            data-testid="pas13-chat-send"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────
function ChatBubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {turn.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
        <div className="whitespace-pre-wrap leading-relaxed">
          {turn.content}
        </div>
        {turn.citations && turn.citations.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {turn.citations.map((c, idx) => (
              <CitationChip key={idx} cite={c} />
            ))}
          </div>
        )}
        {turn.mode && (
          <div className="flex items-center gap-2 pt-1 text-[10px] text-gray-500 dark:text-gray-400">
            {turn.mode === "l2" ? (
              <Badge variant="outline" className="px-1 py-0 text-[9px]">
                deterministic
              </Badge>
            ) : (
              <Badge variant="outline" className="px-1 py-0 text-[9px]">
                PAS 13 + video RAG
              </Badge>
            )}
            {turn.latencyMs ? <span>{turn.latencyMs} ms</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function CitationChip({ cite }: { cite: ChatCitation }) {
  const Icon = cite.type === "video" ? PlayCircle : FileText;
  return (
    <a
      href={cite.url}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${
        cite.type === "video"
          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      }`}
      data-testid={`pas13-cite-${cite.type}`}
      title={cite.label}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{cite.label}</span>
    </a>
  );
}

function EmptyState({
  onPickExample,
}: {
  onPickExample: (q: string) => void;
}) {
  const examples = [
    "What's the minimum post centre for a 5 t forklift at 22.5°?",
    "What does PAS 13 say about pedestrian safety zones behind barriers?",
    "How is barrier deflection zone calculated?",
    "What's the certified test speed range for a PAS 13 impact test?",
  ];
  return (
    <div className="flex flex-col gap-3 pb-2">
      <div className="rounded-md border border-dashed border-gray-300 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
        Ask anything about PAS 13:2017 — calc questions route to the
        deterministic rule engine, descriptive questions run RAG over the
        standard text and A-SAFE's PAS 13 video library. Every answer cites
        its source.
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          Try one:
        </p>
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onPickExample(ex)}
            className="block w-full rounded border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700 px-2 py-1.5 text-left text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
