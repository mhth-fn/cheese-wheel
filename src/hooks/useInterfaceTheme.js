import { useCallback, useEffect, useState } from 'react';

export const INTERFACE_THEME_KEY = 'cheese-wheel-theme';

const CLASSIC_BACKGROUND_COLORS = {
  cheese: '#f8dc78',
  newyear: '#10291c',
  samurai: '#cfc1a4',
  spring: '#eaf6eb',
};

function readStoredTheme() {
  return localStorage.getItem(INTERFACE_THEME_KEY) === 'seraphim'
    ? 'seraphim'
    : 'classic';
}

function applyInterfaceTheme(theme) {
  document.documentElement.dataset.design = theme;
  const classicTheme = localStorage.getItem('theme') || 'cheese';
  document.documentElement.style.backgroundColor = theme === 'seraphim'
    ? '#080806'
    : CLASSIC_BACKGROUND_COLORS[classicTheme] || CLASSIC_BACKGROUND_COLORS.cheese;
}

export function useInterfaceTheme() {
  const [interfaceTheme, setInterfaceThemeState] = useState(readStoredTheme);

  useEffect(() => {
    applyInterfaceTheme(interfaceTheme);
  }, [interfaceTheme]);

  const setInterfaceTheme = useCallback(nextTheme => {
    const normalizedTheme = nextTheme === 'seraphim' ? 'seraphim' : 'classic';
    localStorage.setItem(INTERFACE_THEME_KEY, normalizedTheme);
    applyInterfaceTheme(normalizedTheme);
    setInterfaceThemeState(normalizedTheme);
  }, []);

  return { interfaceTheme, setInterfaceTheme };
}
