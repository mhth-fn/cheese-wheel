import { useEffect } from 'react';

const THEME_CLASSES = [
  'theme-cheese',
  'theme-newyear',
  'theme-spring',
  'theme-samurai',
];
const BROWSER_THEME_COLORS = {
  cheese: '#f8dc78',
  newyear: '#10291c',
  spring: '#eaf6eb',
  samurai: '#cfc1a4',
};

export function useDocumentTheme(theme) {
  useEffect(() => {
    document.body.classList.remove(...THEME_CLASSES);
    document.body.classList.add(`theme-${theme}`);
    document.documentElement.style.backgroundColor = (
      document.documentElement.dataset.design === 'seraphim'
        ? '#080806'
        : BROWSER_THEME_COLORS[theme] || BROWSER_THEME_COLORS.cheese
    );
    localStorage.setItem('theme', theme);
  }, [theme]);
}
