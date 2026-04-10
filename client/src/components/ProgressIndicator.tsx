import { cn } from "@/lib/utils";
import { Check, Circle } from "lucide-react";
import { motion } from "framer-motion";

interface Step {
  id: string;
  label: string;
  description?: string;
  completed?: boolean;
  active?: boolean;
}

interface ProgressIndicatorProps {
  steps: Step[];
  currentStep: number;
  orientation?: 'horizontal' | 'vertical';
  showLabels?: boolean;
  allowClickToStep?: boolean;
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export function ProgressIndicator({
  steps,
  currentStep,
  orientation = 'horizontal',
  showLabels = true,
  allowClickToStep = false,
  onStepClick,
  className
}: ProgressIndicatorProps) {
  const isVertical = orientation === 'vertical';
  
  return (
    <div className={cn(
      "w-full",
      isVertical ? "flex flex-col space-y-4" : "flex items-center justify-between",
      className
    )}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isClickable = allowClickToStep && onStepClick && (isCompleted || isActive);
        
        return (
          <div
            key={step.id}
            className={cn(
              "flex items-center",
              isVertical ? "w-full" : "flex-1",
              index < steps.length - 1 && !isVertical && "relative"
            )}
          >
            <div
              className={cn(
                "flex items-center",
                isVertical ? "w-full" : "flex-col",
                isClickable && "cursor-pointer"
              )}
              onClick={() => isClickable && onStepClick(index)}
            >
              {/* Step Circle */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={cn(
                  "relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
                  isCompleted && "bg-primary border-primary",
                  isActive && "border-primary bg-background shadow-lg shadow-primary/25",
                  !isCompleted && !isActive && "border-muted-foreground/30 bg-background",
                  isClickable && "hover:scale-110"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5 text-primary-foreground" />
                ) : (
                  <span className={cn(
                    "text-sm font-semibold",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {index + 1}
                  </span>
                )}
                
                {/* Active Pulse Effect */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                )}
              </motion.div>
              
              {/* Step Label */}
              {showLabels && (
                <div className={cn(
                  "transition-all duration-300",
                  isVertical ? "ml-4 flex-1" : "mt-2 text-center"
                )}>
                  <p className={cn(
                    "text-sm font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {step.label}
                  </p>
                  {step.description && (
                    <p className={cn(
                      "text-xs mt-1",
                      isActive ? "text-muted-foreground" : "text-muted-foreground/70"
                    )}>
                      {step.description}
                    </p>
                  )}
                </div>
              )}
            </div>
            
            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div className={cn(
                "transition-all duration-500",
                isVertical 
                  ? "ml-5 mt-2 mb-2 w-0.5 h-8 bg-border" 
                  : "absolute top-5 left-[60%] right-[-40%] h-0.5 bg-border -z-10"
              )}>
                <motion.div
                  className={cn(
                    "h-full bg-primary",
                    !isVertical && "h-0.5"
                  )}
                  initial={{ width: "0%" }}
                  animate={{ 
                    width: isCompleted ? "100%" : "0%",
                    height: isVertical ? (isCompleted ? "100%" : "0%") : "100%"
                  }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Mobile-optimized Progress Bar variant
export function ProgressBar({
  steps,
  currentStep,
  className
}: {
  steps: Step[];
  currentStep: number;
  className?: string;
}) {
  const progress = ((currentStep + 1) / steps.length) * 100;
  
  return (
    <div className={cn("w-full space-y-2", className)}>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-foreground">
          Step {currentStep + 1} of {steps.length}
        </span>
        <span className="text-muted-foreground">
          {steps[currentStep]?.label}
        </span>
      </div>
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="absolute top-0 left-0 h-full bg-primary rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// Stepper component for forms
export function FormStepper({
  steps,
  currentStep,
  onNext,
  onPrevious,
  onComplete,
  canGoNext = true,
  canGoPrevious = true,
  className
}: {
  steps: Step[];
  currentStep: number;
  onNext?: () => void;
  onPrevious?: () => void;
  onComplete?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  className?: string;
}) {
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  
  return (
    <div className={cn("space-y-6", className)}>
      <ProgressIndicator
        steps={steps}
        currentStep={currentStep}
        showLabels={true}
      />
      
      <div className="flex justify-between">
        <button
          onClick={onPrevious}
          disabled={isFirstStep || !canGoPrevious}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
            (isFirstStep || !canGoPrevious) && "opacity-50 cursor-not-allowed"
          )}
        >
          Previous
        </button>
        
        <button
          onClick={isLastStep ? onComplete : onNext}
          disabled={!canGoNext}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            !canGoNext && "opacity-50 cursor-not-allowed"
          )}
        >
          {isLastStep ? "Complete" : "Next"}
        </button>
      </div>
    </div>
  );
}