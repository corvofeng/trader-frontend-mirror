import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Navigation } from '../components/Navigation';
import { CommandPalette } from '../components/CommandPalette';
import { Breadcrumbs } from '../shared/components';
import { Theme, themes } from '../lib/theme';
import type { User } from '../lib/services/types';

interface MainLayoutProps {
  children: React.ReactNode;
  user: User | null;
  theme: Theme;
  mobileMenuOpen: boolean;
  showThemeDropdown: boolean;
  onThemeChange: (theme: Theme) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onMobileMenuToggle: () => void;
  onThemeDropdownToggle: () => void;
}

export function MainLayout({
  children,
  user,
  theme,
  mobileMenuOpen,
  showThemeDropdown,
  onThemeChange,
  onSignIn,
  onSignOut,
  onMobileMenuToggle,
  onThemeDropdownToggle
}: MainLayoutProps) {
  const location = useLocation();
  const isTerminal = location.pathname === '/terminal';
  const [hideGlobalNavInTerminal, setHideGlobalNavInTerminal] = useState(() => {
    try {
      return localStorage.getItem('terminal_hide_global_nav') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleNavChange = () => {
      try {
        setHideGlobalNavInTerminal(localStorage.getItem('terminal_hide_global_nav') === '1');
      } catch {}
    };
    window.addEventListener('storage', handleNavChange);
    window.addEventListener('terminal_nav_change', handleNavChange);
    return () => {
      window.removeEventListener('storage', handleNavChange);
      window.removeEventListener('terminal_nav_change', handleNavChange);
    };
  }, []);

  const showNav = !isTerminal || !hideGlobalNavInTerminal;
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Global ⌘K / Ctrl+K shortcut listener for Magic Keyboard and desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`min-h-screen w-full max-w-full overflow-x-hidden ${themes[theme].background} transition-colors duration-200 pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]`}>
      <Toaster position="top-right" />
      
      {showNav && (
        <Navigation
          user={user}
          theme={theme}
          mobileMenuOpen={mobileMenuOpen}
          showThemeDropdown={showThemeDropdown}
          onThemeChange={onThemeChange}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onMobileMenuToggle={onMobileMenuToggle}
          onThemeDropdownToggle={onThemeDropdownToggle}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />
      )}

      {location.pathname !== '/' && !isTerminal && <Breadcrumbs theme={theme} />}

      {children}

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        user={user}
        theme={theme}
        onThemeChange={onThemeChange}
      />
    </div>
  );
}