/**
 * client/src/components/layout-editor/Editor.tsx
 *
 * The Phase 4 layout editor: one full-screen dialog that composes
 *
 *   useBaseSource  → blob: URL for the floor plan (image / PDF / graph paper)
 *   useViewport    → zoom / pan state shared by gestures, toolbar and overlay
 *   useHistory     → immutable LayoutDoc snapshots, undo / redo
 *   useDocSync     → debounced PUT with baseVersion, 409 → reload + toast
 *   tools/*        → pure reducers fed by useGestures (tap, long-press, drag)
 *   Overlay        → the single SVG in content space
 *   Toolbar / ProductPicker / Legend / Inspector / GuardrailPanel /
 *   TitleBlock / CalibrateDialog / NoteDialog / TransferToCartDialog
 *
 * Phone (≤ 768 px): toolbar along the bottom, product picker as a bottom
 * sheet, inspector docked above the toolbar, title block hidden.
 * Larger: left tool rail, side-panel picker, floating inspector, the
 * full A-SAFE title block around the sheet.
 *
 * Interactive HUD pieces are siblings of the Viewport (not its `hud`
 * slot) so a tap on a button never doubles as a tap on the drawing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileText, Layers, Package, Pencil, RotateCcw, ShieldCheck, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { SavedAgoIndicator } from "@/components/SavedAgoIndicator";
import type { LayoutDrawing } from "@shared/schema";
import { createEmptyDoc, elementPoints, type Calibration, type Element, type LayoutDoc, type Pt } from "@shared/layout/doc";
import { runLengthMm } from "@shared/layout/geometry";
import { getFamily, isStampFamily, type FamilyId } from "@shared/layout/symbols";
import { Viewport, type ViewportHandle } from "./Viewport";
import { useViewport } from "./useViewport";
import { KEY_ZOOM_STEP } from "./viewportMath";
import type { GestureHandlers, GesturePoint } from "./useGestures";
import { useHistory } from "./useHistory";
import { useDocSync, type DocSyncStatus } from "./useDocSync";
import { useBaseSource } from "./useBaseSource";
import { useCatalog, useVehicleTypes, guardrailProductsFromCatalog } from "./catalog";
import { evaluateGuardrails, groupViolationsByElement, readGuardrailsDisabled, writeGuardrailsDisabled } from "./guardrails";
import { TOOLS, TOOL_KEYS, TOOL_LABELS, toolDraft, replaceElement, translateElement, stampFamilyFor, type AnyToolState, type ToolContext, type ToolId, type ToolInput, type ToolResult } from "./tools";
import { Overlay, formatMm } from "./Overlay";
import { Toolbar } from "./Toolbar";
import { ProductPicker, readLastSelection } from "./ProductPicker";
import { Legend, FamilySwatch } from "./Legend";
import { Inspector, ElementContextSheet } from "./Inspector";
import { GuardrailPanel } from "./GuardrailPanel";
import { TitleBlock, type TitleBlockMeta, type FloorType } from "./TitleBlock";
import { TitleBlockEditor } from "./TitleBlockEditor";
import { CalibrateDialog } from "./CalibrateDialog";
import { NoteDialog } from "./NoteDialog";
import { TransferToCartDialog } from "./TransferToCartDialog";

export interface LayoutEditorProps {
  isOpen: boolean;
  onClose(): void;
  drawing: LayoutDrawing | null;
}

interface ActiveSelection {
  familyId: string;
  productId?: string;
}

const DEFAULT_RUN: ActiveSelection = { familyId: "iflex-single-traffic" };
const DEFAULT_STAMP: ActiveSelection = { familyId: "bollard-190" };

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function indicatorStatus(s: DocSyncStatus): "idle" | "saving-local" | "syncing" | "synced" | "error" {
  switch (s) {
    case "dirty":
      return "saving-local";
    case "saving":
      return "syncing";
    case "saved":
    case "idle":
      return "synced";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const TOOL_HINTS: Record<ToolId, string> = {
  select: "Tap to select · drag to move · hold for options",
  barrierRun: "Tap to add points · double-tap or ✓ to finish",
  stamp: "Tap to place · drag to place and rotate",
  wall: "Tap to add points · double-tap or ✓ to finish",
  dimension: "Tap two points, or drag",
  note: "Tap where the note should point",
  zone: "Tap corners · double-tap or ✓ to close",
  calibrate: "Tap two ends of a known length",
};

export function LayoutEditor({ isOpen, onClose, drawing }: LayoutEditorProps) {
  const mobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const online = useOnline();
  const drawingId = drawing?.id ?? null;

  // ─── Document, history, sync ───────────────────────────────────────────
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const history = useHistory<LayoutDoc>(createEmptyDoc(), { disabled: !isOpen || modalOpen });
  const doc = history.present;

  const onLoaded = useCallback(
    (d: LayoutDoc, _v: number, migrated: boolean) => {
      history.reset(d);
      setLoaded(true);
      if (migrated && d.elements.length > 0) {
        toast({ title: "Legacy markups imported", description: `${d.elements.length} element${d.elements.length === 1 ? "" : "s"} converted to the new drawing format.` });
      }
    },
    [history, toast],
  );
  const onConflict = useCallback(
    (d: LayoutDoc) => {
      history.reset(d);
      setSelectedId(null);
      setPreview(null);
      toast({ title: "Drawing was updated elsewhere; reloaded", variant: "destructive" });
    },
    [history, toast],
  );
  const sync = useDocSync({ drawingId: isOpen ? drawingId : null, doc: loaded ? doc : null, onLoaded, onConflict });

  useEffect(() => {
    if (!isOpen) setLoaded(false);
  }, [isOpen, drawingId]);

  // ─── Base drawing + viewport ───────────────────────────────────────────
  const base = useBaseSource(drawing, isOpen);
  const viewport = useViewport();
  const viewportRef = useRef<ViewportHandle>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const onNaturalSize = useCallback((width: number, height: number) => setNaturalSize({ width, height }), []);
  useEffect(() => {
    if (!isOpen) setNaturalSize(null);
  }, [isOpen, drawingId]);

  // ─── Catalogue, vehicles ───────────────────────────────────────────────
  const { products, isLoading: catalogLoading } = useCatalog(isOpen);
  const { vehicleTypes } = useVehicleTypes(isOpen);
  const guardrailProducts = useMemo(() => guardrailProductsFromCatalog(products), [products]);

  // ─── Tool state ────────────────────────────────────────────────────────
  const [tool, setTool] = useState<ToolId>("select");
  const toolRef = useRef<ToolId>("select");
  const [toolState, setToolStateRaw] = useState<AnyToolState>(() => TOOLS.select.initial());
  const toolStateRef = useRef<AnyToolState>(toolState);
  const setToolState = useCallback((s: AnyToolState) => {
    toolStateRef.current = s;
    setToolStateRaw(s);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LayoutDoc | null>(null);
  const [angleSnap, setAngleSnap] = useState(true);
  const [activeRun, setActiveRun] = useState<ActiveSelection>(DEFAULT_RUN);
  const [activeStamp, setActiveStamp] = useState<ActiveSelection>(DEFAULT_STAMP);

  useEffect(() => {
    const last = readLastSelection();
    if (last.familyId) {
      const sel = { familyId: last.familyId, productId: last.productId ?? undefined };
      if (isStampFamily(last.familyId)) setActiveStamp(sel);
      else setActiveRun(sel);
    }
  }, []);

  const active = tool === "stamp" ? activeStamp : activeRun;
  const shownDoc = preview ?? doc;
  const selected = selectedId ? shownDoc.elements.find((e) => e.id === selectedId) ?? null : null;
  const drafting = TOOLS[tool].isDrafting(toolState);
  const draft = useMemo(() => toolDraft(tool, toolState), [tool, toolState]);

  const snapCandidates = useMemo(() => {
    const out: Pt[] = [];
    for (const el of doc.elements) out.push(...elementPoints(el));
    return out;
  }, [doc]);

  // ─── Dialog state ──────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"active" | string>("active");
  const [calibrate, setCalibrate] = useState<{ open: boolean; line: { a: Pt; b: Pt } | null }>({ open: false, line: null });
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; at: Pt | null; elementId: string | null }>({ open: false, at: null, elementId: null });
  const [contextSheet, setContextSheet] = useState<{ open: boolean; elementId: string | null }>({ open: false, elementId: null });
  const [titleEditorOpen, setTitleEditorOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(!mobile);
  const [showGuardrails, setShowGuardrails] = useState(!mobile);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [exporting, setExporting] = useState(false);
  const [guardrailsDisabled, setGuardrailsDisabled] = useState<boolean>(() => readGuardrailsDisabled());
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [metaOverride, setMetaOverride] = useState<Partial<TitleBlockMeta>>({});

  useEffect(() => writeGuardrailsDisabled(guardrailsDisabled), [guardrailsDisabled]);
  // useIsMobile resolves after mount; panels default open on desktop, tucked away on phones.
  useEffect(() => {
    setShowLegend(!mobile);
    setShowGuardrails(!mobile);
  }, [mobile]);
  useEffect(() => {
    setModalOpen(pickerOpen || calibrate.open || noteDialog.open || contextSheet.open || titleEditorOpen || transferOpen);
  }, [pickerOpen, calibrate.open, noteDialog.open, contextSheet.open, titleEditorOpen, transferOpen]);

  // ─── Tool dispatch ─────────────────────────────────────────────────────
  const applyResult = useCallback(
    (r: ToolResult<AnyToolState>) => {
      setToolState(r.state);
      if (r.preview !== undefined) setPreview(r.preview);
      if (r.commit) {
        history.push(r.commit);
        setPreview(null);
      }
      if (r.select !== undefined) setSelectedId(r.select);
      if (r.panBy) viewport.panBy(r.panBy.x, r.panBy.y);
      if (r.request) {
        switch (r.request.kind) {
          case "calibrate":
            setCalibrate({ open: true, line: { a: r.request.a, b: r.request.b } });
            break;
          case "noteText":
            setNoteDialog({ open: true, at: r.request.at, elementId: null });
            break;
          case "contextMenu":
            setContextSheet({ open: true, elementId: r.request.elementId });
            break;
        }
      }
    },
    [history, setToolState, viewport],
  );

  const runTool = useCallback(
    (input: ToolInput, pointerType: string = "touch") => {
      const id = toolRef.current;
      const zoom = viewport.getState().zoom;
      const ctx: ToolContext = {
        doc: history.present,
        selectedId,
        tolerancePx: (pointerType === "mouse" ? 8 : 18) / zoom,
        zoom,
        familyId: id === "stamp" ? stampFamilyFor(activeStamp.familyId) : activeRun.familyId,
        productId: id === "stamp" ? activeStamp.productId : activeRun.productId,
        angleSnap,
        snapCandidates,
        newId,
      };
      applyResult(TOOLS[id].handle(toolStateRef.current, input, ctx));
    },
    [viewport, history.present, selectedId, activeStamp, activeRun, angleSnap, snapCandidates, applyResult],
  );

  const changeTool = useCallback(
    (next: ToolId) => {
      if (toolRef.current !== next) {
        // Let the outgoing tool drop its draft.
        applyResult(TOOLS[toolRef.current].handle(toolStateRef.current, { type: "cancel" }, {
          doc: history.present,
          selectedId,
          tolerancePx: 8,
          zoom: 1,
          familyId: activeRun.familyId,
          angleSnap,
          snapCandidates: [],
          newId,
        }));
      }
      toolRef.current = next;
      setTool(next);
      setToolState(TOOLS[next].initial());
      setPreview(null);
      if (next !== "select") setSelectedId(null);
    },
    [applyResult, history.present, selectedId, activeRun.familyId, angleSnap, setToolState],
  );

  const handlers: GestureHandlers = {
    onTap: (p) => runTool({ type: "tap", p: p.content, tapCount: p.tapCount }, p.pointerType),
    onLongPress: (p) => runTool({ type: "longPress", p: p.content }, p.pointerType),
    onDragStart: (p) => runTool({ type: "dragStart", p: p.content, screen: p.screen }, p.pointerType),
    onDragMove: (p: GesturePoint, start: GesturePoint) => runTool({ type: "dragMove", p: p.content, screen: p.screen, start: start.content }, p.pointerType),
    onDragEnd: (p: GesturePoint, start: GesturePoint) => runTool({ type: "dragEnd", p: p.content, screen: p.screen, start: start.content }, p.pointerType),
    onDragCancel: () => runTool({ type: "dragCancel" }),
    onNudge: (dx, dy) => {
      if (!selected) return;
      const z = viewport.getState().zoom;
      history.push(replaceElement(doc, translateElement(selected, dx / z, dy / z)));
    },
  };

  // ─── Element operations ────────────────────────────────────────────────
  const updateElement = useCallback((next: Element) => history.push(replaceElement(history.present, next)), [history]);
  const deleteElement = useCallback(
    (id: string) => {
      history.push({ ...history.present, elements: history.present.elements.filter((e) => e.id !== id) });
      setSelectedId((s) => (s === id ? null : s));
    },
    [history],
  );
  const duplicateElement = useCallback(
    (id: string) => {
      const el = history.present.elements.find((e) => e.id === id);
      if (!el) return;
      const off = 30 / viewport.getState().zoom;
      const copy = { ...translateElement(el, off, off), id: newId() } as Element;
      if (copy.kind === "barrierRun") delete copy.cartItemId;
      if (copy.kind === "stamp") delete copy.cartItemId;
      history.push({ ...history.present, elements: [...history.present.elements, copy] });
      setSelectedId(copy.id);
    },
    [history, viewport],
  );

  const openPickerFor = useCallback(
    (target: "active" | string) => {
      setPickerTarget(target);
      setPickerOpen(true);
    },
    [],
  );

  const onPick = useCallback(
    (familyId: FamilyId, productId?: string) => {
      if (pickerTarget === "active") {
        const sel = { familyId, productId };
        if (isStampFamily(familyId)) {
          setActiveStamp(sel);
          if (toolRef.current !== "stamp") changeTool("stamp");
        } else {
          setActiveRun(sel);
          if (toolRef.current === "select" || toolRef.current === "stamp") changeTool("barrierRun");
        }
        return;
      }
      const el = history.present.elements.find((e) => e.id === pickerTarget);
      if (!el || (el.kind !== "barrierRun" && el.kind !== "stamp")) return;
      const next = { ...el, familyId, productId } as Element;
      if (!productId && (next.kind === "barrierRun" || next.kind === "stamp")) delete next.productId;
      updateElement(next);
    },
    [pickerTarget, history.present, changeTool, updateElement],
  );

  const pickerMode: "run" | "stamp" | "all" =
    pickerTarget === "active"
      ? tool === "stamp"
        ? "stamp"
        : "run"
      : history.present.elements.find((e) => e.id === pickerTarget)?.kind === "stamp"
        ? "stamp"
        : "run";

  // ─── Guardrails ────────────────────────────────────────────────────────
  const notesText = useMemo(() => {
    const parts: string[] = [String((drawing as { notesSection?: string | null } | null)?.notesSection ?? "")];
    for (const el of doc.elements) {
      if ((el.kind === "barrierRun" || el.kind === "stamp") && el.note) parts.push(el.note);
      if (el.kind === "note") parts.push(el.text);
    }
    return parts.join("\n").trim();
  }, [doc, drawing]);

  const violations = useMemo(() => {
    if (guardrailsDisabled || !loaded) return [];
    return evaluateGuardrails({
      doc,
      products: guardrailProducts,
      vehicleTypes,
      vehicleTypeId: doc.vehicleTypeId ?? drawing?.vehicleTypeId ?? null,
      floorType: doc.floorType ?? drawing?.floorType ?? null,
      notesText,
    });
  }, [guardrailsDisabled, loaded, doc, guardrailProducts, vehicleTypes, drawing?.vehicleTypeId, drawing?.floorType, notesText]);
  const violationsByElement = useMemo(() => groupViolationsByElement(violations), [violations]);
  const errorCount = violations.filter((v) => v.severity === "error").length;

  const revealElement = useCallback(
    (id: string) => {
      const el = doc.elements.find((e) => e.id === id);
      if (!el) return;
      const pts = elementPoints(el);
      if (pts.length === 0) return;
      const c = pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }), { x: 0, y: 0 });
      const st = viewport.getState();
      const { width, height } = viewport.containerSize;
      viewport.setState({ zoom: st.zoom, tx: width / 2 - c.x * st.zoom, ty: height / 2 - c.y * st.zoom });
      if (toolRef.current !== "select") changeTool("select");
      setSelectedId(id);
      setPulseId(id);
      window.setTimeout(() => setPulseId((p) => (p === id ? null : p)), 3200);
    },
    [doc, viewport, changeTool],
  );

  // ─── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "Escape":
          if (drafting) runTool({ type: "cancel" });
          else if (selectedId) setSelectedId(null);
          else return;
          e.preventDefault();
          return;
        case "Enter":
          if (drafting) {
            runTool({ type: "finish" });
            e.preventDefault();
          }
          return;
        case "Delete":
        case "Backspace":
          if (selectedId) {
            deleteElement(selectedId);
            e.preventDefault();
          }
          return;
      }
      const t = TOOL_KEYS[e.key.toLowerCase()];
      if (t && !e.shiftKey) {
        changeTool(t);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, modalOpen, drafting, selectedId, runTool, deleteElement, changeTool]);

  useEffect(() => {
    if (!isOpen) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sync.status === "dirty" || sync.status === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isOpen, sync.status]);

  // ─── Title block ───────────────────────────────────────────────────────
  const meta: TitleBlockMeta = useMemo(() => {
    const d = (drawing ?? {}) as Partial<LayoutDrawing> & { projectName?: string | null; company?: string | null };
    return {
      dwgNumber: d.dwgNumber ?? null,
      revision: d.revision ?? null,
      drawingDate: d.drawingDate ?? null,
      drawingTitle: d.drawingTitle ?? null,
      drawingScale: d.drawingScale ?? null,
      author: d.author ?? null,
      checkedBy: d.checkedBy ?? null,
      project: d.projectName || d.company || null,
      revisionHistory: (d.revisionHistory as TitleBlockMeta["revisionHistory"]) ?? null,
      notesSection: d.notesSection ?? null,
      floorType: (doc.floorType as FloorType | undefined) ?? (d.floorType as FloorType | null | undefined) ?? null,
      vehicleTypeId: doc.vehicleTypeId ?? d.vehicleTypeId ?? null,
      ...metaOverride,
    };
  }, [drawing, doc.floorType, doc.vehicleTypeId, metaOverride]);

  const saveMeta = async (next: TitleBlockMeta) => {
    if (!drawingId) return;
    try {
      await apiRequest(`/api/layout-drawings/${drawingId}`, "PATCH", {
        dwgNumber: next.dwgNumber ?? null,
        revision: next.revision ?? null,
        drawingDate: next.drawingDate ?? null,
        drawingTitle: next.drawingTitle ?? null,
        drawingScale: next.drawingScale ?? null,
        author: next.author ?? null,
        checkedBy: next.checkedBy ?? null,
        projectName: next.project ?? null,
        revisionHistory: next.revisionHistory ?? null,
        notesSection: next.notesSection ?? null,
        floorType: next.floorType ?? null,
        vehicleTypeId: next.vehicleTypeId ?? null,
      });
      setMetaOverride(next);
      const d: LayoutDoc = { ...doc };
      if (next.floorType) d.floorType = next.floorType;
      else delete d.floorType;
      if (next.vehicleTypeId) d.vehicleTypeId = next.vehicleTypeId;
      else delete d.vehicleTypeId;
      if (d.floorType !== doc.floorType || d.vehicleTypeId !== doc.vehicleTypeId) history.push(d);
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({ title: "Title block saved" });
    } catch (e) {
      toast({ title: "Couldn't save title block", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
      throw e;
    }
  };

  const commitRename = async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (!drawingId || !name || name === drawing?.fileName) return;
    try {
      await apiRequest(`/api/layout-drawings/${drawingId}`, "PATCH", { fileName: name });
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
    } catch (e) {
      toast({ title: "Rename failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    }
  };

  // ─── Export / close ────────────────────────────────────────────────────
  const exportPdf = async () => {
    if (!drawingId) return;
    setExporting(true);
    try {
      await sync.flush();
      const res = await apiRequest(`/api/layout-drawings/${drawingId}/export`, "POST", {});
      const body = (await res.json()) as { url?: string; objectKey?: string };
      if (body.url) window.open(body.url, "_blank", "noopener");
      toast({ title: "Export ready", description: body.url ? "Opened in a new tab." : "Stored with the drawing." });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) toast({ title: "Export coming soon", description: "Vector PDF export is being built. The drawing is saved." });
      else toast({ title: "Export failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleClose = async () => {
    if (drafting) runTool({ type: "cancel" });
    await sync.flush().catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
    onClose();
  };

  // ─── Derived readouts ──────────────────────────────────────────────────
  const liveLengthMm = useMemo(() => {
    if (!draft || draft.kind !== "polyline") return null;
    const pts = draft.cursor ? [...draft.points, draft.cursor] : draft.points;
    return runLengthMm(pts, doc.calibration);
  }, [draft, doc.calibration]);

  const activeFamily = getFamily(active.familyId);
  const activeProductName = active.productId ? products.find((p) => p.id === active.productId)?.name : undefined;
  const contextElement = contextSheet.elementId ? doc.elements.find((e) => e.id === contextSheet.elementId) ?? null : null;

  if (!drawing) return null;

  const headerBtn = "h-11 min-w-[44px] px-2 sm:px-3";

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => !o && void handleClose()}>
        <DialogContent
          className="fixed left-[50%] top-[50%] flex h-[100dvh] w-[100vw] max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 sm:h-[96vh] sm:w-[98vw] sm:rounded-lg sm:border dark:bg-gray-900 z-[100000] [&>button:last-child]:hidden"
          style={{ zIndex: 100000 }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (drafting || selectedId || modalOpen) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            void handleClose();
          }}
          aria-describedby="layout-editor-description"
          data-testid="layout-editor"
        >
          <DialogTitle className="sr-only">Layout drawing editor</DialogTitle>
          <DialogDescription id="layout-editor-description" className="sr-only">
            Mark up the floor plan with A-SAFE products. Use the tools to draw barrier runs, place point products, add walls, zones, dimensions and notes.
          </DialogDescription>

          {/* Header */}
          <header
            className="flex flex-shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900"
            style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top, 0px))" }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {renaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  data-testid="rename-input"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenameValue(drawing.fileName);
                    setRenaming(true);
                  }}
                  className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Rename drawing"
                  data-testid="rename-trigger"
                >
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{drawing.fileName}</span>
                  <Pencil className="h-3 w-3 flex-shrink-0 text-gray-400" />
                </button>
              )}
              {loaded && <SavedAgoIndicator status={indicatorStatus(sync.status)} online={online} lastSavedAt={sync.lastSavedAt} className="hidden sm:inline-flex" />}
            </div>

            <button
              type="button"
              onClick={() => openPickerFor("active")}
              className={cn(headerBtn, "flex items-center gap-2 rounded-md border border-gray-200 text-left text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800")}
              title="Choose product"
              data-testid="active-product"
            >
              <FamilySwatch familyId={active.familyId} />
              <span className="hidden max-w-[180px] truncate sm:block">{activeProductName ?? activeFamily.label}</span>
              <Package className="h-4 w-4 sm:hidden" />
            </button>
            <Button type="button" variant={showLegend ? "secondary" : "ghost"} size="sm" className={headerBtn} onClick={() => setShowLegend((s) => !s)} title="Legend" aria-pressed={showLegend} data-testid="toggle-legend">
              <Layers className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={showGuardrails ? "secondary" : "ghost"}
              size="sm"
              className={cn(headerBtn, "relative")}
              onClick={() => setShowGuardrails((s) => !s)}
              title="PAS 13 checks"
              aria-pressed={showGuardrails}
              data-testid="toggle-guardrails"
            >
              <ShieldCheck className="h-4 w-4" />
              {violations.length > 0 && (
                <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900", errorCount > 0 ? "bg-red-600" : "bg-amber-500")} aria-hidden />
              )}
            </Button>
            <Button type="button" variant="ghost" size="sm" className={headerBtn} onClick={() => setTransferOpen(true)} title="Transfer to cart" data-testid="open-transfer">
              <ShoppingCart className="h-4 w-4" />
              <span className="ml-1.5 hidden lg:inline">Transfer to cart</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" className={headerBtn} onClick={() => void exportPdf()} disabled={exporting} title="Export vector PDF" data-testid="export-pdf">
              <Download className="h-4 w-4" />
              <span className="ml-1.5 hidden lg:inline">{exporting ? "Exporting…" : "Export"}</span>
            </Button>
            <Button asChild type="button" variant="ghost" size="sm" className={headerBtn} title="Drawing sheet PDF">
              <a href={`/api/layout-drawings/${drawing.id}/documents/sheet.pdf`} target="_blank" rel="noopener noreferrer" data-testid="sheet-pdf-link">
                <FileText className="h-4 w-4" />
                <span className="ml-1.5 hidden lg:inline">Sheet PDF</span>
              </a>
            </Button>
            <Button type="button" variant="ghost" size="sm" className={headerBtn} onClick={() => void handleClose()} title="Close" data-testid="close-editor">
              <X className="h-5 w-5" />
            </Button>
          </header>

          {/* Body */}
          <div className="flex min-h-0 flex-1 flex-row">
            {!mobile && (
              <Toolbar
                tool={tool}
                onToolChange={changeTool}
                layout="rail"
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.undo}
                onRedo={history.redo}
                angleSnap={angleSnap}
                onToggleAngleSnap={() => setAngleSnap((s) => !s)}
                onZoomIn={() => viewport.zoomAt({ x: viewport.containerSize.width / 2, y: viewport.containerSize.height / 2 }, KEY_ZOOM_STEP)}
                onZoomOut={() => viewport.zoomAt({ x: viewport.containerSize.width / 2, y: viewport.containerSize.height / 2 }, 1 / KEY_ZOOM_STEP)}
                onFit={() => viewportRef.current?.fit()}
                activeFamilyColour={activeFamily.colour}
                calibrated={!!doc.calibration}
              />
            )}

            <TitleBlock meta={meta} doc={loaded ? doc : null} catalog={products} onEditMeta={() => setTitleEditorOpen(true)} compact={mobile}>
              <div className="relative min-h-0 flex-1 bg-gray-200 dark:bg-gray-800" data-testid="layout-stage">
                <Viewport
                  ref={viewportRef}
                  viewport={viewport}
                  base={base.source}
                  handlers={handlers}
                  onNaturalSize={onNaturalSize}
                  onBaseError={(err) => toast({ title: "Couldn't display the drawing", description: err.message, variant: "destructive" })}
                  gestureOptions={{ disabled: modalOpen }}
                  className="absolute inset-0"
                >
                  {naturalSize && loaded && (
                    <Overlay
                      doc={shownDoc}
                      width={naturalSize.width}
                      height={naturalSize.height}
                      zoom={viewport.zoom}
                      selectedId={selectedId}
                      draft={draft}
                      activeTool={tool}
                      activeFamilyId={active.familyId}
                      violationsByElement={violationsByElement}
                      pulseElementId={pulseId}
                      showCalibration={tool === "calibrate" || calibrate.open}
                    />
                  )}
                </Viewport>

                {/* Loading / error states */}
                {(base.loading || (!loaded && sync.status === "loading")) && !base.error && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-white/90 px-4 py-2 text-sm shadow dark:bg-gray-900/90">Loading drawing…</div>
                  </div>
                )}
                {(base.error || sync.status === "load-error") && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="max-w-sm rounded-lg bg-white p-4 text-center text-sm shadow-lg dark:bg-gray-900">
                      <p className="font-medium text-red-600">{base.error ?? sync.error}</p>
                      {sync.status === "load-error" && (
                        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={sync.reload}>
                          <RotateCcw className="mr-1.5 h-4 w-4" /> Retry
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Readout chip */}
                <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-col gap-1">
                  <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs text-gray-700 shadow backdrop-blur dark:bg-gray-900/90 dark:text-gray-200" data-testid="readout">
                    <span className="font-semibold">{TOOL_LABELS[tool]}</span>
                    <span className="hidden truncate text-gray-500 sm:inline">{TOOL_HINTS[tool]}</span>
                    {liveLengthMm !== null && <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">{formatMm(liveLengthMm)}</span>}
                    {drafting && liveLengthMm === null && draft?.kind === "polyline" && <span className="text-amber-600">uncalibrated</span>}
                    <span className="font-mono text-gray-400">{Math.round(viewport.zoom * 100)}%</span>
                  </div>
                  {mobile && loaded && <SavedAgoIndicator status={indicatorStatus(sync.status)} online={online} lastSavedAt={sync.lastSavedAt} className="pointer-events-auto rounded-full bg-white/90 px-2 py-0.5 dark:bg-gray-900/90" />}
                </div>

                {/* Draft controls */}
                {drafting && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                    <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/95 p-1 shadow-lg backdrop-blur dark:bg-gray-900/95" data-testid="draft-controls">
                      <Button type="button" variant="ghost" size="sm" className="h-11 rounded-full px-3" onClick={() => runTool({ type: "undoPoint" })} title="Undo last point" data-testid="draft-undo-point">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-11 rounded-full px-3" onClick={() => runTool({ type: "cancel" })} title="Cancel" data-testid="draft-cancel">
                        <X className="h-4 w-4" />
                      </Button>
                      {draft?.kind === "polyline" && (
                        <Button type="button" size="sm" className="h-11 rounded-full bg-green-600 px-4 text-white hover:bg-green-700" onClick={() => runTool({ type: "finish" })} data-testid="draft-finish">
                          <Check className="mr-1 h-4 w-4" /> Finish
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Right-hand panels */}
                {(showLegend || showGuardrails) && (
                  <div className={cn("pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-2", mobile && "top-12 max-w-[calc(100%-1rem)]")}>
                    {showLegend && loaded && <Legend doc={doc} catalog={products} defaultCollapsed={mobile} />}
                    {showGuardrails && loaded && (doc.elements.length > 0 || guardrailsDisabled) && (
                      <GuardrailPanel
                        violations={violations}
                        onShowOnCanvas={revealElement}
                        isDisabled={guardrailsDisabled}
                        onToggleDisabled={() => setGuardrailsDisabled((d) => !d)}
                        defaultCollapsed={mobile}
                      />
                    )}
                  </div>
                )}

                {/* Inspector */}
                {selected && !drafting && tool === "select" && (
                  <div className={cn("pointer-events-none absolute", mobile ? "inset-x-0 bottom-0 p-2" : "bottom-2 right-2")}>
                    <Inspector
                      doc={shownDoc}
                      element={selected}
                      products={products}
                      mobile={mobile}
                      onChange={updateElement}
                      onDelete={() => deleteElement(selected.id)}
                      onDuplicate={() => duplicateElement(selected.id)}
                      onChangeProduct={() => openPickerFor(selected.id)}
                      onClose={() => setSelectedId(null)}
                    />
                  </div>
                )}

                <ProductPicker
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  mobile={mobile}
                  products={products}
                  isLoading={catalogLoading}
                  familyId={pickerTarget === "active" ? active.familyId : ((history.present.elements.find((e) => e.id === pickerTarget) as { familyId?: string } | undefined)?.familyId ?? active.familyId)}
                  productId={pickerTarget === "active" ? active.productId : (history.present.elements.find((e) => e.id === pickerTarget) as { productId?: string } | undefined)?.productId}
                  mode={pickerMode}
                  onSelect={onPick}
                />
              </div>
            </TitleBlock>
          </div>

          {mobile && (
            <Toolbar
              tool={tool}
              onToolChange={changeTool}
              layout="bottom"
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={history.undo}
              onRedo={history.redo}
              angleSnap={angleSnap}
              onToggleAngleSnap={() => setAngleSnap((s) => !s)}
              onZoomIn={() => viewport.zoomAt({ x: viewport.containerSize.width / 2, y: viewport.containerSize.height / 2 }, KEY_ZOOM_STEP)}
              onZoomOut={() => viewport.zoomAt({ x: viewport.containerSize.width / 2, y: viewport.containerSize.height / 2 }, 1 / KEY_ZOOM_STEP)}
              onFit={() => viewportRef.current?.fit()}
              activeFamilyColour={activeFamily.colour}
              calibrated={!!doc.calibration}
            />
          )}
        </DialogContent>
      </Dialog>

      <CalibrateDialog
        open={calibrate.open}
        onOpenChange={(o) => setCalibrate((c) => ({ ...c, open: o }))}
        line={calibrate.line}
        naturalWidth={naturalSize?.width ?? null}
        current={doc.calibration}
        onConfirm={(cal: Calibration) => {
          history.push({ ...doc, calibration: cal });
          toast({ title: "Scale set", description: `${formatMm(cal.lengthMm)} reference. Lengths and posts now derive from it.` });
        }}
        onPickPoints={() => {
          setCalibrate({ open: false, line: null });
          changeTool("calibrate");
        }}
      />

      <NoteDialog
        open={noteDialog.open}
        onOpenChange={(o) => setNoteDialog((n) => ({ ...n, open: o }))}
        title={noteDialog.elementId ? "Add note to element" : "Add note"}
        onConfirm={(text) => {
          if (noteDialog.elementId) {
            const el = doc.elements.find((e) => e.id === noteDialog.elementId);
            if (el && (el.kind === "barrierRun" || el.kind === "stamp")) updateElement({ ...el, note: text });
            else if (el) {
              const pts = elementPoints(el);
              const at = pts[0] ?? { x: 0, y: 0 };
              history.push({ ...doc, elements: [...doc.elements, { kind: "note", id: newId(), at: { x: at.x + 20, y: at.y - 20 }, text }] });
            }
          } else if (noteDialog.at) {
            const id = newId();
            history.push({ ...doc, elements: [...doc.elements, { kind: "note", id, at: noteDialog.at, text }] });
            changeTool("select");
            setSelectedId(id);
          }
        }}
      />

      <ElementContextSheet
        open={contextSheet.open}
        onOpenChange={(o) => setContextSheet((c) => ({ ...c, open: o }))}
        element={contextElement}
        onDuplicate={() => contextSheet.elementId && duplicateElement(contextSheet.elementId)}
        onDelete={() => contextSheet.elementId && deleteElement(contextSheet.elementId)}
        onChangeProduct={() => contextSheet.elementId && openPickerFor(contextSheet.elementId)}
        onAddNote={() => setNoteDialog({ open: true, at: null, elementId: contextSheet.elementId })}
      />

      <TitleBlockEditor isOpen={titleEditorOpen} onOpenChange={setTitleEditorOpen} initial={meta} onSave={saveMeta} />

      <TransferToCartDialog open={transferOpen} onOpenChange={setTransferOpen} doc={doc} catalog={products} applicationArea={drawing.fileName} errorCount={errorCount} />
    </>
  );
}

export default LayoutEditor;
