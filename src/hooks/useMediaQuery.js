import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const readMatch = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches
  );
  const [matches, setMatches] = useState(readMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia(query);
    const onChange = event => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', onChange);
    if (!mediaQuery.addEventListener) mediaQuery.addListener?.(onChange);
    return () => {
      mediaQuery.removeEventListener?.('change', onChange);
      if (!mediaQuery.removeEventListener) mediaQuery.removeListener?.(onChange);
    };
  }, [query]);

  return matches;
}
