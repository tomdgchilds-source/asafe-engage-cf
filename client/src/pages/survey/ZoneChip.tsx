// ─────────────────────────────────────────────────────────
// ZoneChip — the yellow pill in the Survey Walk header showing the zone
// the next photo will be tagged with. Tap → bottom drawer to rename,
// switch to an earlier zone, or start a new one (Phase 3, Task S2).
// ─────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { ZONE_NAME_MAX, defaultZoneName, normaliseZoneName } from "./UploadQueue";

export interface ZoneChipProps {
  zoneName: string;
  /** Every zone seen so far in this walk (including the current one). */
  zones: string[];
  /** Photo count per zone, for the switcher chips. */
  counts?: Record<string, number>;
  onChange: (zoneName: string) => void;
  className?: string;
}

export function ZoneChip({ zoneName, zones, counts, onChange, className }: ZoneChipProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(zoneName);
  const haptic = useHapticFeedback();

  useEffect(() => {
    if (open) setDraft(zoneName);
  }, [open, zoneName]);

  const nextZone = useMemo(() => defaultZoneName([...zones, zoneName]), [zones, zoneName]);

  const commitRename = () => {
    const next = normaliseZoneName(draft, zoneName);
    if (next !== zoneName) {
      onChange(next);
      haptic.save();
    }
    setOpen(false);
  };

  const startNewZone = () => {
    onChange(nextZone);
    haptic.select();
    setOpen(false);
  };

  const switchTo = (name: string) => {
    onChange(name);
    haptic.select();
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          data-testid="zone-chip"
          aria-label={`Zone: ${zoneName}. Tap to rename or start a new zone`}
          className={cn(
            "inline-flex h-11 max-w-[48vw] items-center gap-1.5 rounded-full bg-[#FFC72C] px-3.5 text-sm font-semibold text-[#1D1D1B] shadow-md transition-transform active:scale-95 landscape:max-w-[40vw]",
            className,
          )}
        >
          <MapPin className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{zoneName}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
      </DrawerTrigger>
      <DrawerContent className="border-zinc-800 bg-[#1D1D1B] text-white">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-white">Zone</DrawerTitle>
          <DrawerDescription className="text-zinc-400">The next photos you take are tagged with this zone.</DrawerDescription>
        </DrawerHeader>

        <form
          className="flex gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault();
            commitRename();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={ZONE_NAME_MAX}
            enterKeyHint="done"
            placeholder="e.g. Loading bay 3"
            aria-label="Zone name"
            className="h-12 flex-1 border-zinc-700 bg-zinc-900 text-base text-white placeholder:text-zinc-500 focus-visible:ring-[#FFC72C]"
          />
          <Button type="submit" className="h-12 bg-[#FFC72C] px-5 font-semibold text-[#1D1D1B] hover:bg-[#e6b327]">
            Rename
          </Button>
        </form>

        {zones.length > 1 && (
          <div className="px-4 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Switch to</p>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {zones.map((z) => {
                const active = z === zoneName;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => switchTo(z)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex h-10 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                      active
                        ? "border-[#FFC72C] bg-[#FFC72C]/15 text-[#FFC72C]"
                        : "border-zinc-700 bg-zinc-900 text-zinc-200 active:bg-zinc-800",
                    )}
                  >
                    <span className="truncate">{z}</span>
                    {counts?.[z] ? <span className="text-xs text-zinc-400">{counts[z]}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DrawerFooter className="pb-[max(16px,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            onClick={startNewZone}
            className="h-14 gap-2 bg-[#FFC72C] text-base font-semibold text-[#1D1D1B] hover:bg-[#e6b327]"
          >
            <Plus className="h-5 w-5" aria-hidden />
            New zone ({nextZone})
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" className="h-12 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export default ZoneChip;
