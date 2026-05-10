
import { useState, useEffect } from 'react';
import { getTheme, getThemeNames, defaultTheme } from '../constants/themes';
import { isNhostConfigured, isNhostAuthenticated, fetchThemeSetting, upsertThemeSetting } from '../nhost';

const THEME_STORAGE_KEY = 'emergency-supply-theme';


export const useTheme = () => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved || defaultTheme;
    }
    return defaultTheme;
  });
  const [loadingTheme, setLoadingTheme] = useState(false);


  const [themeData, setThemeData] = useState(getTheme(currentTheme));


  // Update CSS variables and persist theme when it changes
  useEffect(() => {
    const theme = getTheme(currentTheme);
    setThemeData(theme);

    // Apply theme colors to CSS variables
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });

    // Expose an active household color variable that UI can reference.
    let activeColor = '';
    if (currentTheme === 'dark') {
      activeColor = theme.colors.warning || theme.colors.amber500 || theme.colors.orange500 || 'var(--color-warning)';
    } else {
      activeColor = theme.colors.red500 || theme.colors.error || 'var(--color-error)';
    }
    root.style.setProperty('--color-active-household', activeColor);

    // Save to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);

    // Save to cloud if online and authenticated
    if (isNhostConfigured() && isNhostAuthenticated()) {
      upsertThemeSetting(currentTheme).catch((e) => {
        // Non-fatal: just log
        console.warn('Cloud upsertThemeSetting failed:', e.message || e);
      });
    }
  }, [currentTheme]);

  // On mount, try to load theme from cloud if online and authenticated
  useEffect(() => {
    let cancelled = false;
    async function loadCloudTheme() {
      if (isNhostConfigured() && isNhostAuthenticated()) {
        setLoadingTheme(true);
        try {
          const cloudTheme = await fetchThemeSetting();
          if (cloudTheme && getThemeNames().includes(cloudTheme)) {
            if (!cancelled) setCurrentTheme(cloudTheme);
          }
        } catch (e) {
          console.warn('Cloud fetchThemeSetting failed:', e.message || e);
        } finally {
          if (!cancelled) setLoadingTheme(false);
        }
      }
    }
    loadCloudTheme();
    return () => { cancelled = true; };
  }, []);


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
    loadingTheme,
  };
};
