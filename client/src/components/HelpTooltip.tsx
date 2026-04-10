import { HelpCircle, Info, Lightbulb, BookOpen } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface HelpTooltipProps {
  content: string | ReactNode;
  title?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  icon?: 'help' | 'info' | 'lightbulb' | 'book';
  iconSize?: 'sm' | 'md' | 'lg';
  showArrow?: boolean;
  delayDuration?: number;
  className?: string;
  iconClassName?: string;
  contentClassName?: string;
  maxWidth?: number;
  children?: ReactNode;
  showOnHover?: boolean;
  showOnClick?: boolean;
}

export function HelpTooltip({
  content,
  title,
  side = 'top',
  align = 'center',
  icon = 'help',
  iconSize = 'sm',
  showArrow = true,
  delayDuration = 200,
  className,
  iconClassName,
  contentClassName,
  maxWidth = 300,
  children,
  showOnHover = true,
  showOnClick = false
}: HelpTooltipProps) {
  const IconComponent = {
    help: HelpCircle,
    info: Info,
    lightbulb: Lightbulb,
    book: BookOpen
  }[icon];

  const iconSizeClass = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }[iconSize];

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:pointer-events-none disabled:opacity-50",
              className
            )}
            onClick={(e) => {
              if (!showOnClick) {
                e.preventDefault();
              }
            }}
          >
            {children || (
              <IconComponent className={cn(
                iconSizeClass,
                "text-muted-foreground",
                iconClassName
              )} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={cn(
            "max-w-xs p-3",
            contentClassName
          )}
          style={{ maxWidth: `${maxWidth}px` }}
        >
          {title && (
            <div className="font-semibold mb-1">{title}</div>
          )}
          <div className="text-sm">{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Inline help text component
export function InlineHelp({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border",
      className
    )}>
      <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

// Contextual help panel
export function HelpPanel({
  title,
  sections,
  className
}: {
  title: string;
  sections: {
    heading: string;
    content: string | ReactNode;
    icon?: ReactNode;
  }[];
  className?: string;
}) {
  return (
    <div className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-4",
      className
    )}>
      <h3 className="font-semibold text-lg">{title}</h3>
      <div className="space-y-3">
        {sections.map((section, index) => (
          <div key={index} className="space-y-1">
            <div className="flex items-center gap-2">
              {section.icon}
              <h4 className="font-medium text-sm">{section.heading}</h4>
            </div>
            <div className="text-sm text-muted-foreground pl-6">
              {section.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Quick tips component
export function QuickTips({
  tips,
  className
}: {
  tips: string[];
  className?: string;
}) {
  return (
    <div className={cn(
      "space-y-2",
      className
    )}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Lightbulb className="h-4 w-4" />
        Quick Tips
      </div>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {tips.map((tip, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-primary mt-1">•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Guided tour tooltip
export function GuidedTourTooltip({
  step,
  totalSteps,
  content,
  onNext,
  onPrevious,
  onSkip,
  isOpen,
  side = 'bottom',
  align = 'center'
}: {
  step: number;
  totalSteps: number;
  content: string | ReactNode;
  onNext?: () => void;
  onPrevious?: () => void;
  onSkip?: () => void;
  isOpen: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute z-50">
      <div className={cn(
        "bg-popover text-popover-foreground rounded-lg shadow-lg p-4 max-w-sm",
        "animate-in fade-in-0 zoom-in-95"
      )}>
        <div className="space-y-3">
          <div className="text-sm font-medium">
            Step {step} of {totalSteps}
          </div>
          <div className="text-sm">{content}</div>
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              {step > 1 && (
                <button
                  onClick={onPrevious}
                  className="px-3 py-1 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Previous
                </button>
              )}
              {step < totalSteps ? (
                <button
                  onClick={onNext}
                  className="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={onSkip}
                  className="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Finish
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Common help content for reuse
export const commonHelpContent = {
  impactCalculator: {
    title: "Impact Calculator",
    content: "Calculate the kinetic energy of vehicle impacts using PAS 13 methodology. Enter vehicle weight, speed, and angle to get accurate safety barrier recommendations."
  },
  solutionFinder: {
    title: "Solution Finder",
    content: "Answer a few questions about your safety requirements to get personalized product recommendations tailored to your specific needs."
  },
  layoutEditor: {
    title: "Layout Editor",
    content: "Upload floor plans and mark up safety barrier placements. Use drawing tools to add barriers, measure distances, and generate professional site survey reports."
  },
  discountSystem: {
    title: "Exclusive Supplier Discount",
    content: "As an exclusive supplier partner, you receive 12% off all orders with a 24-month commitment period. Discounts are automatically applied at checkout."
  },
  currencySelection: {
    title: "Currency Options",
    content: "Prices can be displayed in AED, SAR, GBP, USD, or EUR. Exchange rates are updated hourly for accurate pricing."
  },
  productSpecifications: {
    title: "Product Specifications",
    content: "View detailed technical specifications including impact ratings, dimensions, materials, and installation requirements for each product."
  },
  quoteGeneration: {
    title: "Quote Generation",
    content: "Generate professional quotes with your selected products. Quotes include pricing, specifications, and validity periods."
  },
  bulkOrdering: {
    title: "Bulk Orders",
    content: "For orders over 50 units, special pricing and delivery options are available. Contact our sales team for custom quotes."
  },
  projectCart: {
    title: "Project Cart",
    content: "Save products to project-specific carts for easy reference and ordering. Perfect for managing multiple sites or projects."
  },
  caseStudies: {
    title: "Case Studies",
    content: "Explore real-world implementations of A-SAFE products across various industries. Download PDFs for detailed insights."
  }
};