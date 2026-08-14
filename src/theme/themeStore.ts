import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  initTheme: () => void;
}

const STORAGE_KEY = 'ryvo_theme';

export const getEffectiveTheme = (mode?: ThemeMode): 'light' | 'dark' => {
  let targetMode = mode;
  if (!targetMode && typeof localStorage !== 'undefined') {
    targetMode = (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system';
  }
  if (targetMode === 'light') return 'light';
  if (targetMode === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
};

const applyThemeToDocument = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const effective = getEffectiveTheme(mode);
  if (effective === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
};

// Only users who have never explicitly chosen a theme get 'system'. Anyone with a saved
// 'light'/'dark' preference keeps it untouched -- this only changes the default for a fresh
// install / cleared storage.
const getInitialMode = (): ThemeMode => {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  }
  return 'system';
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: getInitialMode(),
  setMode: (mode: ThemeMode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode);
    }
    set({ mode });
    applyThemeToDocument(mode);
  },
  initTheme: () => {
    const mode = get().mode;
    applyThemeToDocument(mode);
  },
}));

// Auto initialize theme on import
if (typeof window !== 'undefined') {
  applyThemeToDocument(getInitialMode());
}
