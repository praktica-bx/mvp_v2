// Color themes for the application
// Uses a comprehensive Tailwind-style color palette system

export const themes = {
  light: {
    name: 'Light Mode',
    colors: {
      // Primary - Indigo Blue
      primary: '#023e8a',
      primaryDark: '#0077b6',
      primaryLight: '#bee8ff',
      
      // Accent 1 - Royal Orchid
      accent1: '#9410ab',
      accent1Dark: '#640ab2',
      accent1Light: '#f2c4fa',
      
      // Accent 2 - Neon Pink
      accent2: '#f72585',
      accent2Dark: '#dc0868',
      accent2Light: '#fdd4e6',
      
      // Accent 3 - Emerald
      accent3: '#06d6a0',
      accent3Dark: '#0cb0a9',
      accent3Light: '#c6feef',
      
      // Neutral colors
      white: '#ffffff',
      bg: '#f9f9f9',
      bgHover: '#f2f2f2',
      
      // Text colors
      textDark: '#202020',
      textMedium: '#666666',
      textLight: '#a0a0a0',
      
      // Border colors
      border: '#d9d9d9',
      borderLight: '#ececec',
      
      // Semantic colors
      error: '#f50f0f',
      errorBg: '#fdcfcf',
      errorBorder: '#f96f6f',
      warning: '#ffd166',
      success: '#06d6a0',
      // Additional tokens (legacy colors present in CSS files)
      e3f2fd: '#e3f2fd',
      materialBlue: '#1976d2',
      materialBlueLight: '#bbdefb',
      overlayWhite30: 'rgba(255,255,255,0.3)',
      overlayBlack50: 'rgba(0,0,0,0.5)',
      overlayBlack20: 'rgba(0,0,0,0.2)',
      overlayBlack10: 'rgba(0,0,0,0.1)',
      overlayBlack15: 'rgba(0,0,0,0.15)',
      orange500: '#ff9800',
      orange100: '#fff3e0',
      red500: '#f44336',
      red100: '#ffebee',
      red300: '#ef5350',
      red700: '#c62828',
      red800: '#d32f2f',
      amber300: '#ffb74d',
      redLight: '#ff6b6b',
      amber500: '#ffa500',
      greenLightOverlay: 'rgba(34,197,94,0.1)',
      greenOverlay05: 'rgba(76,175,80,0.05)',
      greenOverlay10: 'rgba(76,175,80,0.1)',
      greenOverlay15: 'rgba(76,175,80,0.15)',
      blueOverlay05: 'rgba(33,150,243,0.05)',
      materialGreen: '#4CAF50',
      materialBluePrimary: '#2196F3',
      neutral333: '#333333',
      neutral666: '#666666',
      neutralEEE: '#eeeeee',
      neutralF5: '#f5f5f5',
      neutralF0: '#f0f0f0',
      neutralFA: '#fafafa',
      primary007bff: '#007bff',
      neutral555: '#555555',
      alertBg: '#f8d7da',
      alertBorderDark: '#721c24',
      alertBorder: '#f5c6cb',
      successBgLight: '#d4edda',
      successBorderDark: '#155724',
      successBorder: '#c3e6cb'
      ,
      ddd: '#dddddd',
      greenOverlay30: 'rgba(76,175,80,0.3)',
      greenOverlay05_exact: 'rgba(76,175,80,0.05)',
      cyanOverlay005: 'rgba(34,197,94,0.05)',
      redOverlay10: 'rgba(239,68,68,0.1)',
      blackOverlay45: 'rgba(0,0,0,0.45)',
      blackOverlay35: 'rgba(0,0,0,0.35)',
      blackOverlay03: 'rgba(0,0,0,0.03)'
    }
  },
  
  dark: {
    name: 'Dark Mode',
    colors: {
      // Primary - Indigo Purple
      primary: '#7209b7',
      primaryDark: '#560bad',
      primaryLight: '#b14af6',
      
      // Accent 1 - Royal Orchid
      accent1: '#b5179e',
      accent1Dark: '#6c0e5e',
      accent1Light: '#ea5dd5',
      
      // Accent 2 - Raspberry Plum
      accent2: '#d61e92',
      accent2Dark: '#811258',
      accent2Light: '#e445aa',
      
      // Accent 3 - Light Cyan (for contrast)
      accent3: '#90e0ef',
      accent3Dark: '#137586',
      accent3Light: '#d2f3f9',
      
      // Neutral colors
      white: '#0d0d0d',
      bg: '#0a0a0f',
      bgHover: '#151520',
      
      // Text colors
      textDark: '#f0f0f5',
      textMedium: '#b0b0c0',
      textLight: '#7a7a8a',
      
      // Border colors
      border: '#3a2a50',
      borderLight: '#2a1a40',
      
      // Semantic colors
      error: '#ff6b6b',
      errorBg: '#3d1a1a',
      errorBorder: '#663333',
      warning: '#ffa500',
      success: '#66bb6a',
      // Additional tokens (legacy colors present in CSS files)
      e3f2fd: '#e3f2fd',
      materialBlue: '#1976d2',
      materialBlueLight: '#bbdefb',
      overlayWhite30: 'rgba(255,255,255,0.3)',
      overlayBlack50: 'rgba(0,0,0,0.5)',
      overlayBlack20: 'rgba(0,0,0,0.2)',
      overlayBlack10: 'rgba(0,0,0,0.1)',
      overlayBlack15: 'rgba(0,0,0,0.15)',
      orange500: '#ff9800',
      orange100: '#fff3e0',
      red500: '#f44336',
      red100: '#ffebee',
      red300: '#ef5350',
      red700: '#c62828',
      red800: '#d32f2f',
      amber300: '#ffb74d',
      redLight: '#ff6b6b',
      amber500: '#ffa500',
      greenLightOverlay: 'rgba(34,197,94,0.1)',
      greenOverlay05: 'rgba(76,175,80,0.05)',
      greenOverlay10: 'rgba(76,175,80,0.1)',
      greenOverlay15: 'rgba(76,175,80,0.15)',
      blueOverlay05: 'rgba(33,150,243,0.05)',
      materialGreen: '#4CAF50',
      materialBluePrimary: '#2196F3',
      neutral333: '#333333',
      neutral666: '#666666',
      neutralEEE: '#eeeeee',
      neutralF5: '#f5f5f5',
      neutralF0: '#f0f0f0',
      neutralFA: '#fafafa',
      primary007bff: '#007bff',
      neutral555: '#555555',
      alertBg: '#f8d7da',
      alertBorderDark: '#721c24',
      alertBorder: '#f5c6cb',
      successBgLight: '#d4edda',
      successBorderDark: '#155724',
      successBorder: '#c3e6cb'
    }
  },
  
  vibrant: {
    name: 'Vibrant Mode',
    colors: {
      // Primary - Racing Red
      primary: '#eb1d1d',
      primaryDark: '#c31111',
      primaryLight: '#f7a5a5',
      
      // Accent 1 - Raspberry Plum
      accent1: '#b5179e',
      accent1Dark: '#6c0e5e',
      accent1Light: '#ea5dd5',
      
      // Accent 2 - Pure Red
      accent2: '#f50f0f',
      accent2Dark: '#c80808',
      accent2Light: '#fb9f9f',
      
      // Accent 3 - Golden Pollen
      accent3: '#ffd166',
      accent3Dark: '#d69600',
      accent3Light: '#ffe3a3',
      
      // Neutral colors
      white: '#ffffff',
      bg: '#fffaf0',
      bgHover: '#fff6e0',
      
      // Text colors
      textDark: '#1a1a1a',
      textMedium: '#4e4e4e',
      textLight: '#a0a0a0',
      
      // Border colors
      border: '#e6e6e6',
      borderLight: '#f2f2f2',
      
      // Semantic colors
      error: '#f50f0f',
      errorBg: '#fde8e1',
      errorBorder: '#fab9a5',
      warning: '#ffd166',
      success: '#83d483',
      // Additional tokens (legacy colors present in CSS files)
      e3f2fd: '#e3f2fd',
      materialBlue: '#1976d2',
      materialBlueLight: '#bbdefb',
      overlayWhite30: 'rgba(255,255,255,0.3)',
      overlayBlack50: 'rgba(0,0,0,0.5)',
      overlayBlack20: 'rgba(0,0,0,0.2)',
      overlayBlack10: 'rgba(0,0,0,0.1)',
      overlayBlack15: 'rgba(0,0,0,0.15)',
      orange500: '#ff9800',
      orange100: '#fff3e0',
      red500: '#f44336',
      red100: '#ffebee',
      red300: '#ef5350',
      red700: '#c62828',
      red800: '#d32f2f',
      amber300: '#ffb74d',
      redLight: '#ff6b6b',
      amber500: '#ffa500',
      greenLightOverlay: 'rgba(34,197,94,0.1)',
      greenOverlay05: 'rgba(76,175,80,0.05)',
      greenOverlay10: 'rgba(76,175,80,0.1)',
      greenOverlay15: 'rgba(76,175,80,0.15)',
      blueOverlay05: 'rgba(33,150,243,0.05)',
      materialGreen: '#4CAF50',
      materialBluePrimary: '#2196F3',
      neutral333: '#333333',
      neutral666: '#666666',
      neutralEEE: '#eeeeee',
      neutralF5: '#f5f5f5',
      neutralF0: '#f0f0f0',
      neutralFA: '#fafafa',
      primary007bff: '#007bff',
      neutral555: '#555555',
      alertBg: '#f8d7da',
      alertBorderDark: '#721c24',
      alertBorder: '#f5c6cb',
      successBgLight: '#d4edda',
      successBorderDark: '#155724',
      successBorder: '#c3e6cb'
    }
  }
};

export const defaultTheme = 'light';

export const getTheme = (themeName = defaultTheme) => {
  return themes[themeName] || themes[defaultTheme];
};

export const getThemeNames = () => Object.keys(themes);
