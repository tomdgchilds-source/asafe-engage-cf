import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Plus, Trash2 } from "lucide-react";
import {
  FLOOR_TYPE_LABELS,
  type FloorType,
  type TitleBlockMeta,
} from "./TitleBlockFrame";

interface VehicleTypeOption {
  id: string;
  name: string;
  category?: string | null;
}

interface TitleBlockEditorProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TitleBlockMeta;
  onSave: (meta: TitleBlockMeta) => Promise<void> | void;
}

/**
 * Modal for editing the dynamic fields that populate TitleBlockFrame.
 * The editor mirrors every cell in the printed title block so sales ops
 * can produce a deliverable that looks identical to a manually-drafted
 * CAD sheet.
 */
export function TitleBlockEditor({ isOpen, onOpenChange, initial, onSave }: TitleBlockEditorProps) {
  const [form, setForm] = useState<TitleBlockMeta>(initial);
  const [isSaving, setIsSaving] = useState(false);

  // Vehicle types catalog — fetched lazily when the dialog opens so we
  // don't pay the network cost for users who never edit the title block.
  const { data: vehicleTypes = [] } = useQuery<VehicleTypeOption[]>({
    queryKey: ["/api/vehicle-types"],
    enabled: isOpen,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (isOpen) setForm(initial);
  }, [isOpen, initial]);

  const updateRevRow = (idx: number, patch: Partial<{ rev: string; date: string; notes: string }>) => {
    setForm((f) => {
      const rows = [...(f.revisionHistory || [])];
      rows[idx] = { ...rows[idx], ...patch };
      return { ...f, revisionHistory: rows };
    });
  };

  const addRevRow = () => {
    setForm((f) => ({
      ...f,
      revisionHistory: [...(f.revisionHistory || []), { rev: "", date: "", notes: "" }],
    }));
  };

  const removeRevRow = (idx: number) => {
    setForm((f) => ({
      ...f,
      revisionHistory: (f.revisionHistory || []).filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[100020]" style={{ zIndex: 100020 }}>
        <DialogHeader>
          <DialogTitle>Drawing title block</DialogTitle>
          <DialogDescription>
            Matches the fields on the printed A-SAFE drawing template.
            Leave any field blank to fall back to a sensible placeholder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Dwg No" placeholder="DWGAE002882" value={form.dwgNumber ?? ""} onChange={(v) => setForm({ ...form, dwgNumber: v })} mono />
            <Field label="Revision" placeholder="03" value={form.revision ?? ""} onChange={(v) => setForm({ ...form, revision: v })} mono />
            <Field label="Date (DD-MMM-YYYY)" placeholder="18-APR-2026" value={form.drawingDate ?? ""} onChange={(v) => setForm({ ...form, drawingDate: v })} mono />
          </div>

          <Field label="Drawing title" placeholder="A-SAFE BARRIER PROPOSAL" value={form.drawingTitle ?? ""} onChange={(v) => setForm({ ...form, drawingTitle: v })} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Project / Client" placeholder="JLL" value={form.project ?? ""} onChange={(v) => setForm({ ...form, project: v })} />
            <Field label="Author (initials)" placeholder="VM" value={form.author ?? ""} onChange={(v) => setForm({ ...form, author: v })} mono />
            <Field label="Checked by (initials)" placeholder="SS" value={form.checkedBy ?? ""} onChange={(v) => setForm({ ...form, checkedBy: v })} mono />
          </div>

          <Field label="Scale" placeholder="NTS" value={form.drawingScale ?? ""} onChange={(v) => setForm({ ...form, drawingScale: v })} mono />

          {/* PAS 13 inputs — drive the anchor_floor_mismatch and
              vehicle_class_mismatch guardrail rules in the layout tool. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Floor type</Label>
              <Select
                value={form.floorType ?? "__unset"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    floorType: v === "__unset" ? null : (v as FloorType),
                  })
                }
              >
                <SelectTrigger data-testid="title-block-floor-type">
                  <SelectValue placeholder="Select substrate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset">— Not set —</SelectItem>
                  {FLOOR_TYPE_LABELS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Drives PAS 13 anchor / substrate compliance checks.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Vehicle type</Label>
              <Select
                value={form.vehicleTypeId ?? "__unset"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    vehicleTypeId: v === "__unset" ? null : v,
                  })
                }
              >
                <SelectTrigger data-testid="title-block-vehicle-type">
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset">— Not set —</SelectItem>
                  {vehicleTypes.map((vt) => (
                    <SelectItem key={vt.id} value={vt.id}>
                      {vt.name}
                      {vt.category ? ` (${vt.category})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Activates the vehicle-class mismatch rule per barrier.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes section (one line per bullet)</Label>
            <Textarea
              rows={3}
              placeholder="e.g. All barriers revised&#10;Columns need to be re-located"
              value={form.notesSection ?? ""}
              onChange={(e) => setForm({ ...form, notesSection: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Revision history</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRevRow}>
                <Plus className="h-3 w-3 mr-1" />
                Add row
              </Button>
            </div>
            <div className="space-y-2">
              {(form.revisionHistory || []).map((row, i) => (
                <div key={i} className="grid grid-cols-[60px_120px_1fr_auto] gap-2">
                  <Input
                    placeholder="01"
                    value={row.rev}
                    onChange={(e) => updateRevRow(i, { rev: e.target.value })}
                  />
                  <Input
                    placeholder="12-JAN-2026"
                    value={row.date}
                    onChange={(e) => updateRevRow(i, { date: e.target.value })}
                  />
                  <Input
                    placeholder="What changed"
                    value={row.notes}
                    onChange={(e) => updateRevRow(i, { notes: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeRevRow(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(!form.revisionHistory || form.revisionHistory.length === 0) && (
                <p className="text-xs text-muted-foreground">No revisions logged yet.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary text-black hover:bg-yellow-400"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? "font-mono" : ""}
      />
    </div>
  );
}
