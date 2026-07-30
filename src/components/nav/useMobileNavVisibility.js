import { useCallback, useEffect, useRef, useState } from 'react';

const MOBILE_LAYOUT_QUERY = (
  '(max-width: 720px), (max-width: 960px) and (max-height: 560px)'
);

function getScrollMetrics() {
  const scrollY = Math.max(0, window.scrollY);
  const scrollHeight = (
    document.scrollingElement?.scrollHeight || document.body.scrollHeight
  );
  return {
    maxScrollY: Math.max(0, scrollHeight - window.innerHeight),
    scrollY,
  };
}

export function useMobileNavVisibility({ activePage, dropdownOpen }) {
  const [hidden, setHidden] = useState(false);
  const hideTimerRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const scrollFrameRef = useRef(null);
  const scrollTravelRef = useRef(0);

  const cancelScheduledHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    cancelScheduledHide();
    scrollTravelRef.current = 0;
    setHidden(false);
  }, [cancelScheduledHide]);

  useEffect(() => {
    document.body.classList.toggle('mobile-nav-hidden', hidden);
    return () => document.body.classList.remove('mobile-nav-hidden');
  }, [hidden]);

  useEffect(() => {
    const mobileLayout = window.matchMedia(MOBILE_LAYOUT_QUERY);

    const reset = () => {
      cancelScheduledHide();
      lastScrollYRef.current = getScrollMetrics().scrollY;
      scrollTravelRef.current = 0;
      setHidden(false);
    };

    const scheduleHide = () => {
      cancelScheduledHide();
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        const { maxScrollY, scrollY } = getScrollMetrics();
        const focusedControl = document.activeElement?.closest?.(
          '.nav-pages, .admin-btn, .drawer-toggle'
        );
        if (
          mobileLayout.matches
          && !dropdownOpen
          && !focusedControl
          && scrollY > 72
          && maxScrollY - scrollY > 32
        ) {
          setHidden(true);
        }
      }, 1600);
    };

    const update = () => {
      scrollFrameRef.current = null;
      const { maxScrollY, scrollY } = getScrollMetrics();
      const delta = scrollY - lastScrollYRef.current;
      lastScrollYRef.current = scrollY;

      if (
        !mobileLayout.matches
        || dropdownOpen
        || scrollY <= 72
        || maxScrollY - scrollY <= 32
      ) {
        reset();
        return;
      }
      if (Math.abs(delta) < 2) return;

      const changedDirection = (
        (scrollTravelRef.current > 0 && delta < 0)
        || (scrollTravelRef.current < 0 && delta > 0)
      );
      scrollTravelRef.current = (
        changedDirection ? delta : scrollTravelRef.current + delta
      );

      if (scrollTravelRef.current > 28 && scrollY > 120) {
        cancelScheduledHide();
        scrollTravelRef.current = 0;
        setHidden(true);
      } else if (scrollTravelRef.current < -14) {
        scrollTravelRef.current = 0;
        setHidden(false);
        scheduleHide();
      }
    };

    const scheduleUpdate = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(update);
    };

    const handleLayoutChange = () => {
      if (mobileLayout.matches) {
        lastScrollYRef.current = getScrollMetrics().scrollY;
      } else {
        reset();
      }
    };

    reset();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', handleLayoutChange);
    mobileLayout.addEventListener?.('change', handleLayoutChange);

    return () => {
      cancelScheduledHide();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', handleLayoutChange);
      mobileLayout.removeEventListener?.('change', handleLayoutChange);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [activePage, cancelScheduledHide, dropdownOpen]);

  return { hidden, reveal };
}
