"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 touch-manipulation cursor-pointer",
      // Enhanced mobile touch handling
      "min-h-[44px] active:bg-accent/5 transition-colors duration-75",
      // Better touch feedback
      "will-change-[background-color] backface-visibility-hidden",
      // Prevent zoom on iOS
      "text-[16px] sm:text-sm",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50 transition-transform duration-200 data-[state=open]:rotate-180" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      "hover:bg-accent/50 transition-colors",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4 animate-bounce" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      "hover:bg-accent/50 transition-colors",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4 animate-bounce" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-[100015] min-w-[8rem] rounded-md border bg-popover text-popover-foreground shadow-md",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        "origin-[--radix-select-content-transform-origin]",
        // Scrolling improvements
        "overflow-hidden",
        // Dynamic width constraints
        "max-w-[calc(100vw-2rem)]",
        // Smart height that prevents cutoff - leaves space for safe area and padding
        "max-h-[var(--radix-popper-available-height,300px)]",
        // Add scroll gradient indicators
        "relative",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      side="bottom"
      align="start"
      sideOffset={4}
      alignOffset={0}
      collisionPadding={8}
      avoidCollisions={true}
      sticky="always"
      {...props}
    >
      {/* Top scroll indicator with gradient */}
      <div className="pointer-events-none sticky top-0 z-10 h-6 bg-gradient-to-b from-popover via-popover/80 to-transparent opacity-0 transition-opacity data-[visible=true]:opacity-100" />
      
      <SelectScrollUpButton className="sticky top-0 z-20 bg-popover/95 backdrop-blur-sm border-b border-border/50" />
      
      <SelectPrimitive.Viewport
        className={cn(
          "p-1 touch-manipulation",
          // Enable smooth scrolling with proper constraints
          "overflow-y-auto overflow-x-hidden",
          "max-h-[min(300px,var(--radix-popper-available-height,300px))]",
          "-webkit-overflow-scrolling-touch overscroll-behavior-contain",
          // Custom scrollbar styling
          "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
          "hover:scrollbar-thumb-muted-foreground/50",
          position === "popper" &&
            "w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      
      <SelectScrollDownButton className="sticky bottom-0 z-20 bg-popover/95 backdrop-blur-sm border-t border-border/50" />
      
      {/* Bottom scroll indicator with gradient */}
      <div className="pointer-events-none sticky bottom-0 z-10 h-6 bg-gradient-to-t from-popover via-popover/80 to-transparent opacity-0 transition-opacity data-[visible=true]:opacity-100" />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-sm py-3 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 touch-manipulation",
      // Enhanced mobile touch targets - Apple recommends minimum 44px
      "min-h-[44px] active:bg-accent/80 transition-colors duration-75",
      // Better spacing on larger screens
      "sm:min-h-[40px] sm:py-2.5",
      // Ensure proper touch handling
      "will-change-[background-color] backface-visibility-hidden",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText className="leading-relaxed">{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
