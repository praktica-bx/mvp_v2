import { useTheme } from '../hooks/useTheme';
import { getTheme } from '../constants/themes';
import { Sun, Moon, RefreshCw } from 'lucide-react';
import './ThemeSwitcher.css';
import { syncToCloud } from '../database';

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

  const { currentTheme, switchTheme } = useTheme();
  const [syncing, setSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncToCloud();
      setSyncResult(result);
    } catch (e) {
      setSyncResult({ success: false, error: e.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button
        className="theme-icon-toggle"
        onClick={handleSync}
        title={syncing ? 'Syncing...' : 'Sync data to cloud'}
        disabled={syncing}
        aria-label="Sync data"
      >
        <RefreshCw size={22} className={syncing ? 'spin' : ''} />
      </button>
      <button
        className="theme-icon-toggle"
        onClick={() => switchTheme(currentTheme === 'light' ? 'dark' : 'light')}
        title={`Switch to ${currentTheme === 'light' ? 'Dark' : 'Light'} mode`}
        aria-label="Toggle light/dark mode"
      >
        {currentTheme === 'light' ? <Sun size={24} /> : <Moon size={24} />}
      </button>
    </div>
  );
}
