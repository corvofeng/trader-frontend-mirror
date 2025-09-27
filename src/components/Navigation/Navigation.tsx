import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Menu, X, Sun, Moon, Palette } from 'lucide-react';
import { Theme, themes } from '../../lib/theme';
import type { User } from '../../lib/services/types';

interface NavigationProps {
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

const themeIcons = {
  light: <Sun className="w-5 h-5" />,
  dark: <Moon className="w-5 h-5" />,
  blue: <Palette className="w-5 h-5" />
};

export function Navigation({
  user,
  theme,
  mobileMenuOpen,
  showThemeDropdown,
  onThemeChange,
  onSignIn,
  onSignOut,
  onMobileMenuToggle,
  onThemeDropdownToggle
}: NavigationProps) {
  const navigate = useNavigate();
  
  return (
    <nav className={`${themes[theme].card} shadow-sm transition-colors duration-200 sticky top-0 z-50`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <h1 
              className={`text-lg sm:text-xl font-bold ${themes[theme].text} cursor-pointer`}
              onClick={() => navigate('/')}
            >
              Stock Trading Journal
            </h1>
          </div>
          
          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-4">
            <div className="relative">
              <button
                onClick={onThemeDropdownToggle}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md ${themes[theme].secondary}`}
              >
                {themeIcons[theme]}
                <span className={`ml-2 ${themes[theme].text}`}>Theme</span>
              </button>
              
              {showThemeDropdown && (
                <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${themes[theme].card} ring-1 ring-black ring-opacity-5 z-50`}>
                  <div className="py-1" role="menu" aria-orientation="vertical">
                    {Object.entries(themes).map(([themeName, _]) => (
                      <button
                        key={themeName}
                        onClick={() => onThemeChange(themeName as Theme)}
                        className={`flex items-center w-full px-4 py-2 text-sm ${
                          theme === themeName ? themes[theme].primary : themes[theme].secondary
                        }`}
                      >
                        {themeIcons[themeName as Theme]}
                        <span className="ml-2 capitalize">{themeName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="flex flex-col items-end">
                  <span className={`text-sm font-medium ${themes[theme].text}`}>
                    {user.name}
                  </span>
                  <span className={`text-xs ${themes[theme].text} opacity-75`}>
                    {user.email}
                  </span>
                </div>
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <button
                  onClick={onSignOut}
                  className={`inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].secondary}`}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={onSignIn}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].primary}`}
              >
                <LogIn className="w-5 h-5 mr-2" />
                Sign In
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={onMobileMenuToggle}
              className={`p-2 rounded-md ${themes[theme].text}`}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className={`md:hidden ${themes[theme].card} border-t ${themes[theme].border} py-4 absolute left-0 right-0 shadow-lg`}>
            <div className="flex flex-col space-y-4 px-4">
              <div className="flex justify-center space-x-2">
                {Object.entries(themes).map(([themeName, _]) => (
                  <button
                    key={themeName}
                    onClick={() => onThemeChange(themeName as Theme)}
                    className={`p-2 rounded-full ${
                      theme === themeName ? themes[theme].primary : themes[theme].secondary
                    }`}
                  >
                    {themeIcons[themeName as Theme]}
                  </button>
                ))}
              </div>
              {user ? (
                <>
                  <div className="flex items-center justify-center space-x-3 py-2">
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${themes[theme].text}`}>
                        {user.name}
                      </span>
                      <span className={`text-xs ${themes[theme].text} opacity-75`}>
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={onSignOut}
                    className={`w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].secondary}`}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={onSignIn}
                  className={`w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${themes[theme].primary}`}
                >
                  <LogIn className="w-5 h-5 mr-2" />
                  Sign In
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}