import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_LIFETIME = 3000;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Set());

  const showToast = useCallback((message, type = 'info') => {
    const id = ++nextIdRef.current;
    setToasts(previous => [...previous, { id, message, type }]);

    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      setToasts(previous => previous.filter(toast => toast.id !== id));
    }, TOAST_LIFETIME);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(timer => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  return { showToast, toasts };
}
