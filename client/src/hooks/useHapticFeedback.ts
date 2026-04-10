import { useCallback } from 'react';

export enum HapticPattern {
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  LIGHT = 'light',
  MEDIUM = 'medium',
  HEAVY = 'heavy',
  SAVE = 'save',
  DELETE = 'delete',
  SUBMIT = 'submit',
  UPLOAD = 'upload',
  DRAW = 'draw',
  // Cart patterns
  ADD_TO_CART = 'addToCart',
  REMOVE_FROM_CART = 'removeFromCart',
  UPDATE_QUANTITY = 'updateQuantity',
  CHECKOUT = 'checkout',
  // Navigation patterns
  PAGE_TRANSITION = 'pageTransition',
  MODAL_OPEN = 'modalOpen',
  MODAL_CLOSE = 'modalClose',
  TAB_SWITCH = 'tabSwitch',
  // Form patterns
  FIELD_ERROR = 'fieldError',
  FIELD_SUCCESS = 'fieldSuccess',
  FORM_SUBMIT = 'formSubmit',
  // Calculation patterns
  CALCULATE = 'calculate',
  CALIBRATE = 'calibrate',
  // Drawing patterns
  DRAW_START = 'drawStart',
  DRAW_END = 'drawEnd',
  DRAW_SNAP = 'drawSnap',
  // Notification patterns
  NOTIFICATION = 'notification',
  ALERT = 'alert',
  // Selection patterns
  SELECT = 'select',
  DESELECT = 'deselect',
  TOGGLE = 'toggle'
}

// Vibration patterns (in milliseconds)
const VIBRATION_PATTERNS = {
  [HapticPattern.SUCCESS]: [100, 50, 100],
  [HapticPattern.WARNING]: [200, 100, 200],
  [HapticPattern.ERROR]: [300, 100, 300, 100, 300],
  [HapticPattern.LIGHT]: [50],
  [HapticPattern.MEDIUM]: [100],
  [HapticPattern.HEAVY]: [200],
  [HapticPattern.SAVE]: [80, 40, 80],
  [HapticPattern.DELETE]: [150, 100, 150],
  [HapticPattern.SUBMIT]: [120, 60, 120, 60, 120],
  [HapticPattern.UPLOAD]: [100, 50, 100, 50, 100],
  [HapticPattern.DRAW]: [40],
  // Cart patterns
  [HapticPattern.ADD_TO_CART]: [50, 100, 50],
  [HapticPattern.REMOVE_FROM_CART]: [100, 50, 100],
  [HapticPattern.UPDATE_QUANTITY]: [30],
  [HapticPattern.CHECKOUT]: [100, 100, 100],
  // Navigation patterns
  [HapticPattern.PAGE_TRANSITION]: [10],
  [HapticPattern.MODAL_OPEN]: [20],
  [HapticPattern.MODAL_CLOSE]: [15],
  [HapticPattern.TAB_SWITCH]: [25],
  // Form patterns
  [HapticPattern.FIELD_ERROR]: [50, 50],
  [HapticPattern.FIELD_SUCCESS]: [30],
  [HapticPattern.FORM_SUBMIT]: [100, 50, 100],
  // Calculation patterns
  [HapticPattern.CALCULATE]: [30, 30, 30],
  [HapticPattern.CALIBRATE]: [50, 100, 50, 100],
  // Drawing patterns
  [HapticPattern.DRAW_START]: [30],
  [HapticPattern.DRAW_END]: [20, 20],
  [HapticPattern.DRAW_SNAP]: [15],
  // Notification patterns
  [HapticPattern.NOTIFICATION]: [100, 200, 100],
  [HapticPattern.ALERT]: [200, 100, 200, 100],
  // Selection patterns
  [HapticPattern.SELECT]: [10],
  [HapticPattern.DESELECT]: [15],
  [HapticPattern.TOGGLE]: [20]
};

interface HapticFeedbackOptions {
  enabled?: boolean;
  force?: boolean;
}

export function useHapticFeedback(options: HapticFeedbackOptions = {}) {
  const { enabled = true, force = false } = options;

  // Check if vibration is supported with enhanced mobile detection
  const isSupported = useCallback(() => {
    // Check for standard Vibration API
    if ('vibrate' in navigator) return true;
    
    // Check for webkit prefixed version (older Safari)
    if ('webkitVibrate' in navigator) return true;
    
    // Check for iOS Haptic Engine (iOS 13+)
    if ((window as any).webkit?.messageHandlers?.haptic) return true;
    
    // Check if running as PWA on iOS
    if ((window as any).navigator?.standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      return true;
    }
    
    return false;
  }, []);

  // Check if user has haptic feedback enabled
  const isHapticEnabled = useCallback(() => {
    if (force) return true;
    if (!enabled) return false;
    
    // Check user preference from localStorage
    const userPreference = localStorage.getItem('haptic-feedback-enabled');
    return userPreference !== 'false'; // Default to enabled
  }, [enabled, force]);

  // Trigger haptic feedback with enhanced mobile support
  const triggerHaptic = useCallback((pattern: HapticPattern) => {
    if (!isSupported() || !isHapticEnabled()) {
      return;
    }

    try {
      const vibrationPattern = VIBRATION_PATTERNS[pattern];
      
      // Try standard Vibration API first
      if ('vibrate' in navigator) {
        // On mobile devices, ensure pattern is not too long
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile && vibrationPattern.length > 5) {
          // Simplify pattern for mobile
          navigator.vibrate(vibrationPattern.slice(0, 5));
        } else {
          navigator.vibrate(vibrationPattern);
        }
        return;
      }
      
      // Try webkit prefixed version for older Safari
      if ('webkitVibrate' in (navigator as any)) {
        (navigator as any).webkitVibrate(vibrationPattern);
        return;
      }
      
      // Try iOS Haptic Engine for iOS 13+
      if ((window as any).webkit?.messageHandlers?.haptic) {
        // iOS Haptic Engine uses different API
        (window as any).webkit.messageHandlers.haptic.postMessage({
          type: pattern,
          intensity: 1.0
        });
        return;
      }
      
      // Fallback for iOS PWA - use Audio API to trigger taptic engine
      if ((window as any).navigator?.standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        // Create a short silent audio to trigger taptic engine
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        gainNode.gain.value = 0.00001; // Nearly silent
        oscillator.frequency.value = 200;
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + (vibrationPattern[0] || 50) / 1000);
      }
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }, [isSupported, isHapticEnabled]);

  // Convenience methods for common patterns
  const success = useCallback(() => triggerHaptic(HapticPattern.SUCCESS), [triggerHaptic]);
  const warning = useCallback(() => triggerHaptic(HapticPattern.WARNING), [triggerHaptic]);
  const error = useCallback(() => triggerHaptic(HapticPattern.ERROR), [triggerHaptic]);
  const save = useCallback(() => triggerHaptic(HapticPattern.SAVE), [triggerHaptic]);
  const deleteAction = useCallback(() => triggerHaptic(HapticPattern.DELETE), [triggerHaptic]);
  const submit = useCallback(() => triggerHaptic(HapticPattern.SUBMIT), [triggerHaptic]);
  const upload = useCallback(() => triggerHaptic(HapticPattern.UPLOAD), [triggerHaptic]);
  const draw = useCallback(() => triggerHaptic(HapticPattern.DRAW), [triggerHaptic]);
  const light = useCallback(() => triggerHaptic(HapticPattern.LIGHT), [triggerHaptic]);
  const medium = useCallback(() => triggerHaptic(HapticPattern.MEDIUM), [triggerHaptic]);
  const heavy = useCallback(() => triggerHaptic(HapticPattern.HEAVY), [triggerHaptic]);
  
  // Cart methods
  const addToCart = useCallback(() => triggerHaptic(HapticPattern.ADD_TO_CART), [triggerHaptic]);
  const removeFromCart = useCallback(() => triggerHaptic(HapticPattern.REMOVE_FROM_CART), [triggerHaptic]);
  const updateQuantity = useCallback(() => triggerHaptic(HapticPattern.UPDATE_QUANTITY), [triggerHaptic]);
  const checkout = useCallback(() => triggerHaptic(HapticPattern.CHECKOUT), [triggerHaptic]);
  
  // Navigation methods
  const pageTransition = useCallback(() => triggerHaptic(HapticPattern.PAGE_TRANSITION), [triggerHaptic]);
  const modalOpen = useCallback(() => triggerHaptic(HapticPattern.MODAL_OPEN), [triggerHaptic]);
  const modalClose = useCallback(() => triggerHaptic(HapticPattern.MODAL_CLOSE), [triggerHaptic]);
  const tabSwitch = useCallback(() => triggerHaptic(HapticPattern.TAB_SWITCH), [triggerHaptic]);
  
  // Form methods
  const fieldError = useCallback(() => triggerHaptic(HapticPattern.FIELD_ERROR), [triggerHaptic]);
  const fieldSuccess = useCallback(() => triggerHaptic(HapticPattern.FIELD_SUCCESS), [triggerHaptic]);
  const formSubmit = useCallback(() => triggerHaptic(HapticPattern.FORM_SUBMIT), [triggerHaptic]);
  
  // Calculation methods
  const calculate = useCallback(() => triggerHaptic(HapticPattern.CALCULATE), [triggerHaptic]);
  const calibrate = useCallback(() => triggerHaptic(HapticPattern.CALIBRATE), [triggerHaptic]);
  
  // Drawing methods
  const drawStart = useCallback(() => triggerHaptic(HapticPattern.DRAW_START), [triggerHaptic]);
  const drawEnd = useCallback(() => triggerHaptic(HapticPattern.DRAW_END), [triggerHaptic]);
  const drawSnap = useCallback(() => triggerHaptic(HapticPattern.DRAW_SNAP), [triggerHaptic]);
  
  // Notification methods
  const notification = useCallback(() => triggerHaptic(HapticPattern.NOTIFICATION), [triggerHaptic]);
  const alert = useCallback(() => triggerHaptic(HapticPattern.ALERT), [triggerHaptic]);
  
  // Selection methods
  const select = useCallback(() => triggerHaptic(HapticPattern.SELECT), [triggerHaptic]);
  const deselect = useCallback(() => triggerHaptic(HapticPattern.DESELECT), [triggerHaptic]);
  const toggle = useCallback(() => triggerHaptic(HapticPattern.TOGGLE), [triggerHaptic]);

  return {
    triggerHaptic,
    success,
    warning,
    error,
    save,
    delete: deleteAction,
    submit,
    upload,
    draw,
    light,
    medium,
    heavy,
    // Cart
    addToCart,
    removeFromCart,
    updateQuantity,
    checkout,
    // Navigation
    pageTransition,
    modalOpen,
    modalClose,
    tabSwitch,
    // Forms
    fieldError,
    fieldSuccess,
    formSubmit,
    // Calculations
    calculate,
    calibrate,
    // Drawing
    drawStart,
    drawEnd,
    drawSnap,
    // Notifications
    notification,
    alert,
    // Selection
    select,
    deselect,
    toggle,
    isSupported: isSupported(),
    isEnabled: isHapticEnabled(),
  };
}

// Hook for managing haptic preferences
export function useHapticPreferences() {
  const setHapticEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem('haptic-feedback-enabled', enabled.toString());
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('haptic-preference-changed', { 
      detail: { enabled } 
    }));
  }, []);

  const getHapticEnabled = useCallback(() => {
    const stored = localStorage.getItem('haptic-feedback-enabled');
    return stored !== 'false'; // Default to enabled
  }, []);

  return {
    setHapticEnabled,
    getHapticEnabled,
    isHapticEnabled: getHapticEnabled(),
  };
}