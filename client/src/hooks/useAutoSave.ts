import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, AlertCircle } from 'lucide-react';

interface AutoSaveOptions {
  delay?: number; // Delay in milliseconds before saving
  onSave: (data: any) => Promise<void>;
  enabled?: boolean;
  showToast?: boolean;
  showIndicator?: boolean;
}

export enum SaveStatus {
  IDLE = 'idle',
  SAVING = 'saving',
  SAVED = 'saved',
  ERROR = 'error'
}

export function useAutoSave<T>({
  delay = 1000,
  onSave,
  enabled = true,
  showToast = false,
  showIndicator = true
}: AutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.IDLE);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef<T | null>(null);
  const { toast } = useToast();

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Save function
  const performSave = useCallback(async (data: T) => {
    if (!enabled) return;

    try {
      setSaveStatus(SaveStatus.SAVING);
      setError(null);
      
      await onSave(data);
      
      setSaveStatus(SaveStatus.SAVED);
      setLastSaved(new Date());
      
      if (showToast) {
        toast({
          title: "Auto-saved",
          description: "Your changes have been saved",
          duration: 2000,
        });
      }
      
      // Reset to idle after showing saved status
      setTimeout(() => {
        setSaveStatus(SaveStatus.IDLE);
      }, 2000);
      
    } catch (err) {
      setSaveStatus(SaveStatus.ERROR);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save';
      setError(errorMessage);
      
      if (showToast) {
        toast({
          title: "Save failed",
          description: errorMessage,
          variant: "destructive",
          duration: 4000,
        });
      }
    }
  }, [enabled, onSave, showToast, toast]);

  // Trigger auto-save with debouncing
  const triggerAutoSave = useCallback((data: T) => {
    if (!enabled) return;

    // Store the latest data
    dataRef.current = data;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set status to indicate pending save
    if (saveStatus === SaveStatus.IDLE || saveStatus === SaveStatus.SAVED) {
      setSaveStatus(SaveStatus.IDLE);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      if (dataRef.current !== null) {
        performSave(dataRef.current);
      }
    }, delay);
  }, [enabled, delay, performSave, saveStatus]);

  // Manual save function
  const saveNow = useCallback(async (data: T) => {
    // Clear any pending auto-save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    await performSave(data);
  }, [performSave]);

  // Reset function
  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setSaveStatus(SaveStatus.IDLE);
    setError(null);
  }, []);

  return {
    saveStatus,
    lastSaved,
    error,
    triggerAutoSave,
    saveNow,
    reset,
    isSaving: saveStatus === SaveStatus.SAVING,
    hasSaved: saveStatus === SaveStatus.SAVED,
    hasError: saveStatus === SaveStatus.ERROR,
  };
}


// Hook for form auto-save
export function useFormAutoSave<T extends Record<string, any>>({
  formData,
  onSave,
  enabled = true,
  delay = 2000,
  dependencies = []
}: {
  formData: T;
  onSave: (data: T) => Promise<void>;
  enabled?: boolean;
  delay?: number;
  dependencies?: any[];
}) {
  const autoSave = useAutoSave({
    delay,
    onSave,
    enabled,
    showIndicator: true
  });

  // Trigger auto-save when form data changes
  useEffect(() => {
    if (enabled && formData) {
      autoSave.triggerAutoSave(formData);
    }
  }, [formData, enabled, ...dependencies]);

  return autoSave;
}