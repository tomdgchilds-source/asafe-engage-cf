/**
 * client/src/components/layout-editor/NoteDialog.tsx
 *
 * Text entry for a new note callout (Note tool) or "Add note" from the
 * context sheet. Autofocuses the textarea; Cmd/Ctrl+Enter confirms.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export interface NoteDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  initial?: string;
  title?: string;
  onConfirm(text: string): void;
}

export function NoteDialog({ open, onOpenChange, initial = "", title = "Add note", onConfirm }: NoteDialogProps) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);

  const confirm = () => {
    const t = text.trim();
    if (!t) return;
    onConfirm(t);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100010] sm:max-w-md" style={{ zIndex: 100010 }} data-testid="note-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Shown as a callout on the drawing and in the export.</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") confirm();
          }}
          placeholder="e.g. Existing column — keep 600 mm clear"
          data-testid="note-dialog-text"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11">
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={!text.trim()} className="h-11 bg-primary text-black hover:bg-yellow-400" data-testid="note-dialog-confirm">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
