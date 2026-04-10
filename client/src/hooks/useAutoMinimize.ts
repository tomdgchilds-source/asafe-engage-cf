import { useState, useEffect, useRef } from 'react';

export function useAutoMinimize(initialExpanded: boolean = true) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-minimize on scroll with debounce to prevent excessive checks
  useEffect(() => {
    const handleScroll = () => {
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Debounce the scroll check to prevent performance issues
      scrollTimeoutRef.current = setTimeout(() => {
        if (isExpanded && cardRef.current) {
          const rect = cardRef.current.getBoundingClientRect();
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          
          // Only minimize when the ENTIRE card is completely out of view
          const isCompletelyAboveViewport = rect.bottom < 0;
          const isCompletelyBelowViewport = rect.top > viewportHeight;
          const isCompletelyOutOfView = isCompletelyAboveViewport || isCompletelyBelowViewport;
          
          // If entire card is out of view, minimize it
          if (isCompletelyOutOfView) {
            setIsExpanded(false);
          }
        }
      }, 100); // 100ms debounce delay
    };

    if (isExpanded) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', handleScroll);
        // Clean up timeout on unmount
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }
  }, [isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return {
    isExpanded,
    setIsExpanded,
    toggleExpanded,
    cardRef,
  };
}