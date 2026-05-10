import React from 'react';
import { Palette } from 'lucide-react';

export type ThemeName = 'hacker-green' | 'deep-space' | 'cyber-pink' | 'ice-blue';

interface ThemeConfig {
  name: string;
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  glow: string;
  description: string;
}

export const themes: Record<ThemeName, ThemeConfig> = {
  'hacker-green': {
    name: 'HACKER GREEN',
    primary: '#22c55e',
    accent: '#a855f7',
    background: '#12121a',
    foreground: '#86efac',
    card: '#1a1a25',
    glow: 'rgba(34, 197, 94, 0.35)',
    description: 'Classic terminal green on deep slate',
  },
  'deep-space': {
    name: 'DEEP SPACE',
    primary: '#818cf8',
    accent: '#38bdf8',
    background: '#101018',
    foreground: '#c7d2fe',
    card: '#181826',
    glow: 'rgba(129, 140, 248, 0.35)',
    description: 'Cool indigo on deep slate',
  },
  'cyber-pink': {
    name: 'CYBER PINK',
    primary: '#ec4899',
    accent: '#00d4ff',
    background: '#150a1a',
    foreground: '#f9a8d4',
    card: '#1f1028',
    glow: 'rgba(236, 72, 153, 0.35)',
    description: 'Neon pink and cyan cyberpunk',
  },
  'ice-blue': {
    name: 'ICE BLUE',
    primary: '#00d4ff',
    accent: '#a5f3fc',
    background: '#0a1118',
    foreground: '#a5f3fc',
    card: '#101a25',
    glow: 'rgba(0, 212, 255, 0.35)',
    description: 'Frozen blue arctic terminal',
  },
};

interface ThemeSwitcherProps {
  current: ThemeName;
  onChange: (theme: ThemeName) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ current, onChange }) => {
  return (
    <div className="flex items-center gap-2">
      <Palette size={12} className="text-white/40" />
      <div className="flex gap-1">
        {(Object.keys(themes) as ThemeName[]).map((themeName) => {
          const theme = themes[themeName];
          const isActive = current === themeName;
          return (
            <button
              key={themeName}
              onClick={() => onChange(themeName)}
              className={`pixel-btn-secondary p-1.5 relative ${isActive ? 'glow-border' : ''}`}
              style={{
                borderColor: isActive ? theme.primary : 'hsl(var(--border))',
                backgroundColor: isActive ? theme.primary + '20' : undefined,
              }}
              title={theme.description}
            >
              <div
                className="w-3 h-3"
                style={{ backgroundColor: theme.primary }}
              />
              {isActive && (
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5"
                  style={{ backgroundColor: theme.primary }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Apply theme CSS variables
export const applyTheme = (themeName: ThemeName) => {
  const theme = themes[themeName];
  const root = document.documentElement;
  root.style.setProperty('--theme-primary', theme.primary);
  root.style.setProperty('--theme-accent', theme.accent);
  root.style.setProperty('--theme-bg', theme.background);
  root.style.setProperty('--theme-fg', theme.foreground);
  root.style.setProperty('--theme-card', theme.card);
  root.style.setProperty('--theme-glow', theme.glow);
};
