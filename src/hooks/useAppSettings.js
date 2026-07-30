import { useState } from 'react';

export function useAppSettings() {
  const [addEnabled, setAddEnabled] = useState(null);
  const [decorationsEnabled, setDecorationsEnabled] = useState(null);
  const [spinDuration, setSpinDuration] = useState(5);
  const [spinEnabled, setSpinEnabled] = useState(null);
  const [theme, setThemeState] = useState(
    () => localStorage.getItem('theme') || 'cheese'
  );

  return {
    addEnabled,
    decorationsEnabled,
    setAddEnabled,
    setDecorationsEnabled,
    setSpinDuration,
    setSpinEnabled,
    setThemeState,
    spinDuration,
    spinEnabled,
    theme,
  };
}
