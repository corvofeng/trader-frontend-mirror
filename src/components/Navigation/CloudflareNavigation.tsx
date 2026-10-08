import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TrendingUp, Globe, Sun, Moon, Palette, Menu, X } from 'lucide-react';
import { type Theme, themes } from '../../lib/theme';
import { useLanguage } from '../../lib/context/LanguageContext';
import type { NavigationProps } from './types';

const themeIcons = {
  light: <Sun className="w-4 h-4" />,
  dark: <Moon className="w-4 h-4" />,
  blue: <Palette className="w-4 h-4" />
};

export function CloudflareNavigation({
  theme,
  mobileMenuOpen,
  showThemeDropdown,
  onThemeChange,
  onMobileMenuToggle,
  onThemeDropdownToggle
}: NavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActivePath = (path: string) => location.pathname === path;
  const { lang, setLang, isEn } = useLanguage();

  return (
    <nav className={`${themes[theme].card} border-b ${themes[theme].border} backdrop-blur-md bg-opacity-95 dark:bg-opacity-95 sticky top-0 z-40 transition-colors duration-200 pt-[env(safe-area-inset-top,0px)] shadow-[0_4px_20px_-4px_rgba(15,23,42,0.07)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.85)]`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div 
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={() => navigate('/')}
            >
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30 group-hover:scale-105 transition-transform duration-200 ring-1 ring-white/20">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className={`text-lg sm:text-xl font-bold tracking-tight ${themes[theme].text}`}>
                Trader<span className="text-blue-500">Log</span>
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40 select-none">
              Public Edge
            </span>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1.5 p-1 rounded-xl fin-well border border-black/5 dark:border-white/5">
            <button
              onClick={() => navigate('/')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap transition-all ${
                isActivePath('/')
                  ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {isEn ? 'Home' : '首页'}
            </button>
            <button
              onClick={() => navigate('/journal')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap transition-all ${
                isActivePath('/journal')
                  ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {isEn ? 'Portfolio' : '投资组合'}
            </button>
            <button
              onClick={() => navigate('/about')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium btn-tactile select-none whitespace-nowrap transition-all ${
                isActivePath('/about')
                  ? themes[theme].primary + ' shadow-xs font-semibold ring-1 ring-white/10'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {isEn ? 'About' : '关于'}
            </button>
          </div>

          {/* Desktop Right Toolbar */}
          <div className="hidden md:flex items-center space-x-3 shrink-0">
            {/* Global Language Switcher */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700/60 text-xs font-semibold shadow-2xs">
              <Globe className="w-3.5 h-3.5 mx-1.5 opacity-60 shrink-0 text-slate-500 dark:text-zinc-400" />
              <button
                type="button"
                onClick={() => setLang('zh')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  lang === 'zh'
                    ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                aria-label="切换到中文"
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  lang === 'en'
                    ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
                aria-label="Switch to English"
              >
                English
              </button>
            </div>

            {/* Theme Toggle */}
            <div className="relative">
              <button
                onClick={onThemeDropdownToggle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-tactile text-sm ${themes[theme].secondary}`}
                title={isEn ? 'Theme' : '切换主题'}
              >
                {themeIcons[theme]}
                <span className={`capitalize hidden lg:inline ${themes[theme].text}`}>{theme}</span>
              </button>

              {showThemeDropdown && (
                <div className={`absolute right-0 mt-2 w-36 rounded-xl ${themes[theme].card} border ${themes[theme].border} fin-card-floating popover-spring z-50 overflow-hidden shadow-lg`}>
                  <div className="py-1">
                    {Object.keys(themes).map((themeName) => (
                      <button
                        key={themeName}
                        onClick={() => onThemeChange(themeName as Theme)}
                        className={`flex items-center w-full px-3.5 py-2 text-xs font-medium btn-tactile ${
                          theme === themeName ? themes[theme].primary : `${themes[theme].secondary} hover:opacity-100 opacity-80`
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
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={onMobileMenuToggle}
              className={`p-2 rounded-lg ${themes[theme].text} btn-tactile`}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className={`md:hidden ${themes[theme].card} border-t ${themes[theme].border} py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] absolute left-0 right-0 shadow-lg animate-fade-in z-50`}>
            <div className="flex flex-col space-y-4 px-4">
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    navigate('/');
                    onMobileMenuToggle();
                  }}
                  className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left btn-tactile ${
                    isActivePath('/')
                      ? `${themes[theme].primary} text-white font-semibold shadow-sm`
                      : themes[theme].secondary
                  }`}
                >
                  {isEn ? 'Home' : '首页'}
                </button>
                <button
                  onClick={() => {
                    navigate('/journal');
                    onMobileMenuToggle();
                  }}
                  className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left btn-tactile ${
                    isActivePath('/journal')
                      ? `${themes[theme].primary} text-white font-semibold shadow-sm`
                      : themes[theme].secondary
                  }`}
                >
                  {isEn ? 'Portfolio' : '投资组合'}
                </button>
                <button
                  onClick={() => {
                    navigate('/about');
                    onMobileMenuToggle();
                  }}
                  className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left btn-tactile ${
                    isActivePath('/about')
                      ? `${themes[theme].primary} text-white font-semibold shadow-sm`
                      : themes[theme].secondary
                  }`}
                >
                  {isEn ? 'About' : '关于'}
                </button>
              </div>

              {/* Language Switcher in Mobile */}
              <div className="flex justify-center pt-2 border-t border-slate-100 dark:border-zinc-800">
                <div className="inline-flex items-center p-1 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700/60 text-xs font-semibold shadow-xs">
                  <Globe className="w-3.5 h-3.5 mx-1.5 opacity-60 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setLang('zh')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      lang === 'zh'
                        ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    中文
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      lang === 'en'
                        ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>

              {/* Theme Picker in Mobile */}
              <div className="flex justify-center space-x-2 pt-1">
                {Object.keys(themes).map((themeName) => (
                  <button
                    key={themeName}
                    onClick={() => onThemeChange(themeName as Theme)}
                    className={`p-2 rounded-full ${
                      theme === themeName ? themes[theme].primary : themes[theme].secondary
                    }`}
                    title={themeName}
                  >
                    {themeIcons[themeName as Theme]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
