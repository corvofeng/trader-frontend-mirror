import type { RegionalColorConfig } from '../shared/types';

export type Theme = 'light' | 'dark' | 'blue';

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  card: string;
  cardHover: string;
  input: string;
  border: string;
  semantic: {
    snapshotBanner: string;
    snapshotIcon: string;
    snapshotText: string;
  };
  chart: {
    upColor: string;
    downColor: string;
    gridColor: string;
    crosshairColor: string;
  };
}

export function getThemeColors(theme: Theme, regionalColors: RegionalColorConfig): ThemeColors {
  const baseTheme = getBaseTheme(theme);
  return {
    ...baseTheme,
    chart: {
      ...baseTheme.chart,
      upColor: regionalColors.upColor,
      downColor: regionalColors.downColor,
    }
  };
}

function getBaseTheme(theme: Theme): ThemeColors {
  const baseThemes = {
    light: {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs',
      secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200/60',
      background: 'bg-slate-50',
      text: 'text-slate-900',
      card: 'bg-white',
      cardHover: 'hover:bg-slate-50/80',
      input: 'bg-white border-slate-200 text-slate-900',
      border: 'border-slate-200/80',
      semantic: {
        snapshotBanner: 'bg-amber-50 border-l-4 border-amber-500',
        snapshotIcon: 'text-amber-500',
        snapshotText: 'text-amber-800',
      },
      chart: {
        upColor: '#10b981',
        downColor: '#ef4444',
        gridColor: '#f1f5f9',
        crosshairColor: '#94a3b8'
      }
    },
    dark: {
      primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20',
      secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50',
      background: 'bg-zinc-950',
      text: 'text-zinc-100',
      card: 'bg-zinc-900/90',
      cardHover: 'hover:bg-zinc-800/80',
      input: 'bg-zinc-900 border-zinc-800 text-zinc-100',
      border: 'border-zinc-800/80',
      semantic: {
        snapshotBanner: 'bg-amber-950/40 border-l-4 border-amber-500/80',
        snapshotIcon: 'text-amber-400',
        snapshotText: 'text-amber-200/90',
      },
      chart: {
        upColor: '#10b981',
        downColor: '#ef4444',
        gridColor: '#27272a',
        crosshairColor: '#71717a'
      }
    },
    blue: {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20',
      secondary: 'bg-blue-100/80 hover:bg-blue-200/80 text-blue-900 border border-blue-200/60',
      background: 'bg-[#f0f5ff]',
      text: 'text-slate-900',
      card: 'bg-white',
      cardHover: 'hover:bg-blue-50/60',
      input: 'bg-white border-blue-200 text-slate-900',
      border: 'border-blue-100',
      semantic: {
        snapshotBanner: 'bg-amber-50/90 border-l-4 border-amber-500',
        snapshotIcon: 'text-amber-500',
        snapshotText: 'text-amber-800',
      },
      chart: {
        upColor: '#10b981',
        downColor: '#ef4444',
        gridColor: '#e0e7ff',
        crosshairColor: '#60a5fa'
      }
    }
  } satisfies Record<Theme, ThemeColors>;
  return baseThemes[theme];
}

// 保持向后兼容的默认主题（使用美国配色）
export const themes: Record<Theme, ThemeColors> = {
  light: getBaseTheme('light'),
  dark: getBaseTheme('dark'),
  blue: getBaseTheme('blue')
};

export const THEME_HEX_BACKGROUNDS: Record<Theme, string> = {
  light: '#f8fafc',
  dark: '#09090b',
  blue: '#f0f5ff'
};
