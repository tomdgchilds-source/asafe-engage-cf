import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
  enabled?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const activeShortcuts = useRef<ShortcutConfig[]>([]);

  useEffect(() => {
    activeShortcuts.current = shortcuts.filter(s => s.enabled !== false);

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        // Allow some global shortcuts even in inputs
        const allowedInInputs = ['Escape'];
        if (!allowedInInputs.includes(event.key)) {
          return;
        }
      }

      activeShortcuts.current.forEach(shortcut => {
        const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesCtrl = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
        const matchesAlt = shortcut.alt ? event.altKey : !event.altKey;
        const matchesShift = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const matchesMeta = shortcut.meta ? event.metaKey : !event.metaKey;

        if (matchesKey && matchesCtrl && matchesAlt && matchesShift && matchesMeta) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// Global keyboard shortcuts for the entire app
export function useGlobalKeyboardShortcuts() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const shortcuts: ShortcutConfig[] = [
    // Navigation shortcuts
    {
      key: 'h',
      ctrl: true,
      description: 'Go to Home',
      action: () => setLocation('/')
    },
    {
      key: 'p',
      ctrl: true,
      description: 'Go to Products',
      action: () => setLocation('/products')
    },
    {
      key: 'c',
      ctrl: true,
      shift: true,
      description: 'Go to Cart',
      action: () => setLocation('/cart')
    },
    {
      key: 's',
      ctrl: true,
      shift: true,
      description: 'Go to Solution Finder',
      action: () => setLocation('/solution-finder')
    },
    // Search shortcut
    {
      key: '/',
      description: 'Focus search',
      action: () => {
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    },
    // Help shortcut
    {
      key: '?',
      shift: true,
      description: 'Show keyboard shortcuts',
      action: () => {
        toast({
          title: "Keyboard Shortcuts",
          description: "Press Ctrl+K to see all available shortcuts",
          duration: 3000,
        });
      }
    },
    // Escape to close modals
    {
      key: 'Escape',
      description: 'Close modal/dialog',
      action: () => {
        // Trigger close for any open modals
        const closeButton = document.querySelector('[aria-label="Close"], [data-dismiss="modal"], button[aria-label*="close"]') as HTMLElement;
        if (closeButton) {
          closeButton.click();
        }
      }
    }
  ];

  useKeyboardShortcuts(shortcuts);
  return shortcuts;
}

// Command palette hook
export function useCommandPalette() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const commands = [
    { id: 'home', label: 'Go to Home', action: () => setLocation('/') },
    { id: 'products', label: 'Browse Products', action: () => setLocation('/products') },
    { id: 'cart', label: 'View Cart', action: () => setLocation('/cart') },
    { id: 'calculator', label: 'Impact Calculator', action: () => setLocation('/calculator') },
    { id: 'solution', label: 'Solution Finder', action: () => setLocation('/solution-finder') },
    { id: 'survey', label: 'Site Survey', action: () => setLocation('/site-survey') },
    { id: 'resources', label: 'Resources', action: () => setLocation('/resources') },
    { id: 'profile', label: 'My Profile', action: () => setLocation('/profile') },
    { id: 'orders', label: 'My Orders', action: () => setLocation('/orders') },
    { id: 'quotes', label: 'My Quotes', action: () => setLocation('/quotes') },
    { id: 'contact', label: 'Contact Us', action: () => setLocation('/contact') },
    { id: 'logout', label: 'Logout', action: () => window.location.href = '/api/logout' },
  ];

  return commands;
}

// Keyboard shortcut display component helper
export function formatShortcut(shortcut: ShortcutConfig): string {
  const keys = [];
  if (shortcut.ctrl) keys.push('Ctrl');
  if (shortcut.alt) keys.push('Alt');
  if (shortcut.shift) keys.push('Shift');
  if (shortcut.meta) keys.push('Cmd');
  keys.push(shortcut.key.toUpperCase());
  return keys.join('+');
}

// Hook for specific page shortcuts
export function usePageShortcuts(pageShortcuts: ShortcutConfig[]) {
  useKeyboardShortcuts(pageShortcuts);
}

// Accessibility shortcuts
export function useAccessibilityShortcuts() {
  const shortcuts: ShortcutConfig[] = [
    {
      key: 'Tab',
      description: 'Navigate forward',
      action: () => {},
      preventDefault: false
    },
    {
      key: 'Tab',
      shift: true,
      description: 'Navigate backward',
      action: () => {},
      preventDefault: false
    },
    {
      key: 'Enter',
      description: 'Activate element',
      action: () => {},
      preventDefault: false
    },
    {
      key: ' ',
      description: 'Toggle element',
      action: () => {},
      preventDefault: false
    },
    {
      key: 'ArrowUp',
      description: 'Move up in lists',
      action: () => {
        // Custom list navigation logic
      },
      enabled: false // Enable only in specific contexts
    },
    {
      key: 'ArrowDown',
      description: 'Move down in lists',
      action: () => {
        // Custom list navigation logic
      },
      enabled: false // Enable only in specific contexts
    }
  ];

  return shortcuts;
}