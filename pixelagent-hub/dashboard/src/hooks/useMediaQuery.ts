import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 768px)');
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 769px) and (max-width: 1023px)');
}

/** True when the user has requested reduced motion via OS / browser preferences. */
export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
