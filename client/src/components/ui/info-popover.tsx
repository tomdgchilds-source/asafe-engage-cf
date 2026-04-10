import { useState } from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface InfoPopoverProps {
  content: string;
  className?: string;
  iconClassName?: string;
}

export function InfoPopover({ content, className, iconClassName = "h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer" }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center justify-center">
          <Info className={iconClassName} />
        </button>
      </PopoverTrigger>
      <PopoverContent className={className || "max-w-[90vw] w-max"}>
        <p className="text-sm">{content}</p>
      </PopoverContent>
    </Popover>
  );
}