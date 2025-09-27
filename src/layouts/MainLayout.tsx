import React from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Navigation } from '../components/Navigation';
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
  const showNav = location.pathname !== '/';

  return (
    <div className={`min-h-screen ${themes[theme].background} transition-colors duration-200`}>
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
        />
      )}

      {showNav && <Breadcrumbs theme={theme} />}

      {children}
    </div>
  );
}