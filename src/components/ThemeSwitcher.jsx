import { useTheme } from '../hooks/useTheme';
import { getTheme } from '../constants/themes';
import { Sun, Moon } from 'lucide-react';
import './ThemeSwitcher.css';

export function ThemeSwitcherFull() {
  const { currentTheme, switchTheme, availableThemes } = useTheme();

  return (
    <div className="theme-switcher">
      {availableThemes.map((theme) => {
        const themeData = getTheme(theme);
        return (
          <button
            key={theme}
            className={`theme-button ${currentTheme === theme ? 'active' : ''}`}
            onClick={() => switchTheme(theme)}
            title={`Switch to ${themeData.name}`}
          >
            <span className="theme-name">{themeData.name}</span>
            <div className="theme-preview">
              <span 
                className="color-swatch" 
                style={{ backgroundColor: themeData.colors.primary }}
                title="Primary"
              />
              <span 
                className="color-swatch" 
                style={{ backgroundColor: themeData.colors.accent1 }}
                title="Accent 1"
              />
              <span 
                className="color-swatch" 
                style={{ backgroundColor: themeData.colors.accent2 }}
                title="Accent 2"
              />
              <span 
                className="color-swatch" 
                style={{ backgroundColor: themeData.colors.accent3 }}
                title="Accent 3"
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function ThemeSwitcher() {
  const { currentTheme, switchTheme } = useTheme();

  return (
    <button 
      className="theme-icon-toggle"
      onClick={() => switchTheme(currentTheme === 'light' ? 'dark' : 'light')}
      title={`Switch to ${currentTheme === 'light' ? 'Dark' : 'Light'} mode`}
    >
      {currentTheme === 'light' ? <Sun size={24} /> : <Moon size={24} />}
    </button>
  );
}
