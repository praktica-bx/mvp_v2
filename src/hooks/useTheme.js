import { useState, useEffect } from 'react';
import { getTheme, getThemeNames, defaultTheme } from '../constants/themes';

const THEME_STORAGE_KEY = 'emergency-supply-theme';

export const useTheme = () => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    // Try to get saved theme from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved || defaultTheme;
    }
    return defaultTheme;
  });

  const [themeData, setThemeData] = useState(getTheme(currentTheme));

  // Update CSS variables when theme changes
  useEffect(() => {
    const theme = getTheme(currentTheme);
    setThemeData(theme);
    
    // Apply theme colors to CSS variables
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });

    // Save to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  }, [currentTheme]);

  const switchTheme = (themeName) => {
    if (getThemeNames().includes(themeName)) {
      setCurrentTheme(themeName);
    }
  };

  const nextTheme = () => {
    const themes = getThemeNames();
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setCurrentTheme(themes[nextIndex]);
  };

  return {
    currentTheme,
    themeData,
    switchTheme,
    nextTheme,
    availableThemes: getThemeNames(),
  };
};
