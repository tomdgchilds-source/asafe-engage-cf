/**
 * Haptic Feedback Utility
 * Provides tactile feedback for user interactions on mobile devices
 * Uses the Vibration API when available
 */

// Check if the device supports haptic feedback
export const supportsHaptic = (): boolean => {
  return 'vibrate' in navigator;
};

// Haptic feedback patterns for different interaction types
export const HapticPatterns = {
  // Success patterns
  success: [50, 100, 50], // Short-pause-short vibration for success
  heavySuccess: [100, 50, 100, 50, 200], // More pronounced success
  lightSuccess: [30], // Light tap for minor success
  
  // Error patterns  
  error: [200, 100, 200], // Long-pause-long for errors
  warning: [100, 50, 100], // Medium intensity warning
  
  // Interaction patterns
  selection: [10], // Very light tap for selections
  impact: [20], // Light impact for button presses
  notification: [100, 200, 100], // Attention-getting pattern
  
  // Special patterns
  delete: [50, 50, 50, 50, 50], // Rapid pulses for delete
  save: [50, 100, 150], // Ascending pattern for save
  submit: [100, 50, 100, 50, 100], // Rhythmic pattern for submit
  
  // Drawing patterns
  drawStart: [30], // Light tap when starting to draw
  drawEnd: [20, 20], // Double tap when finishing draw
  drawSnap: [15], // Very light tap for snapping
  
  // Cart patterns
  addToCart: [50, 100, 50], // Pleasant confirmation
  removeFromCart: [100, 50, 100], // Warning-like pattern
  checkout: [100, 100, 100], // Three solid taps
  
  // Navigation patterns
  pageTransition: [10], // Subtle transition feedback
  modalOpen: [20], // Light feedback for modal
  modalClose: [15], // Even lighter for close
  
  // Calculation patterns
  calculate: [30, 30, 30], // Triple light tap
  calibrate: [50, 100, 50, 100], // Calibration confirmation
};

// Main haptic feedback function
export const triggerHaptic = (pattern: number[] | number = HapticPatterns.impact): void => {
  if (!supportsHaptic()) {
    return;
  }
  
  try {
    const vibrationPattern = Array.isArray(pattern) ? pattern : [pattern];
    navigator.vibrate(vibrationPattern);
  } catch (error) {
    // Silently fail if vibration is not supported or blocked
    console.debug('Haptic feedback not available:', error);
  }
};

// Convenience functions for common haptic feedback scenarios
export const haptic = {
  // Success feedback
  success: () => triggerHaptic(HapticPatterns.success),
  heavySuccess: () => triggerHaptic(HapticPatterns.heavySuccess),
  lightSuccess: () => triggerHaptic(HapticPatterns.lightSuccess),
  
  // Error feedback
  error: () => triggerHaptic(HapticPatterns.error),
  warning: () => triggerHaptic(HapticPatterns.warning),
  
  // Interaction feedback
  selection: () => triggerHaptic(HapticPatterns.selection),
  impact: () => triggerHaptic(HapticPatterns.impact),
  notification: () => triggerHaptic(HapticPatterns.notification),
  
  // Action feedback
  delete: () => triggerHaptic(HapticPatterns.delete),
  save: () => triggerHaptic(HapticPatterns.save),
  submit: () => triggerHaptic(HapticPatterns.submit),
  
  // Drawing feedback
  drawStart: () => triggerHaptic(HapticPatterns.drawStart),
  drawEnd: () => triggerHaptic(HapticPatterns.drawEnd),
  drawSnap: () => triggerHaptic(HapticPatterns.drawSnap),
  
  // Cart feedback
  addToCart: () => triggerHaptic(HapticPatterns.addToCart),
  removeFromCart: () => triggerHaptic(HapticPatterns.removeFromCart),
  checkout: () => triggerHaptic(HapticPatterns.checkout),
  
  // Navigation feedback
  pageTransition: () => triggerHaptic(HapticPatterns.pageTransition),
  modalOpen: () => triggerHaptic(HapticPatterns.modalOpen),
  modalClose: () => triggerHaptic(HapticPatterns.modalClose),
  
  // Calculation feedback
  calculate: () => triggerHaptic(HapticPatterns.calculate),
  calibrate: () => triggerHaptic(HapticPatterns.calibrate),
  
  // Custom pattern
  custom: (pattern: number[] | number) => triggerHaptic(pattern),
};

// React hook for haptic feedback
import { useCallback } from 'react';

export const useHaptic = () => {
  const trigger = useCallback((pattern: number[] | number = HapticPatterns.impact) => {
    triggerHaptic(pattern);
  }, []);
  
  return {
    trigger,
    ...haptic,
    supportsHaptic: supportsHaptic(),
  };
};

// Haptic feedback for form validation
export const hapticFormFeedback = {
  fieldError: () => triggerHaptic([50, 50]), // Double tap for field error
  fieldSuccess: () => triggerHaptic([30]), // Light tap for field success
  formError: () => triggerHaptic(HapticPatterns.error),
  formSuccess: () => triggerHaptic(HapticPatterns.success),
};

// Haptic feedback with delay (useful for animations)
export const hapticWithDelay = (pattern: number[] | number, delay: number): void => {
  setTimeout(() => triggerHaptic(pattern), delay);
};

// Stop any ongoing vibration
export const stopHaptic = (): void => {
  if (supportsHaptic()) {
    navigator.vibrate(0);
  }
};