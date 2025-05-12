import React from 'react';
import { Sun, Moon, Palette } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';

interface ThemeToggleProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export function ThemeToggle({ currentTheme, onThemeChange }: ThemeToggleProps) {
  const themeIcons = {
    light: <Sun className="w-5 h-5" />,
    dark: <Moon className="w-5 h-5" />,
    blue: <Palette className="w-5 h-5" />
  };

  return (
    <div className="flex items-center space-x-2">
      {Object.entries(themeIcons).map(([theme, icon]) => (
        <button
          key={theme}
          onClick={() => onThemeChange(theme as Theme)}
          className={`p-2 rounded-full transition-colors duration-200 ${
            currentTheme === theme
              ? `${themes[currentTheme].primary} shadow-lg`
              : `${themes[currentTheme].secondary}`
          }`}
          aria-label={`${theme} theme`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}