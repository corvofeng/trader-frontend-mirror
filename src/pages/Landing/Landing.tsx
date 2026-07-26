import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe } from 'lucide-react';
import { HeroSection } from './components/HeroSection';
import { MarketOverview } from './components/MarketOverview';
import { PortfolioPreview } from './components/PortfolioPreview';
import { FeaturesGrid } from './components/FeaturesGrid';
import { Theme, themes } from '../../lib/theme';
import type { User } from '../../lib/services/types';
import { Language } from './i18n';

interface LandingProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  user: User | null;
}

export function Landing({ theme, onThemeChange, user }: LandingProps) {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('app_lang') as Language;
    return saved === 'en' ? 'en' : 'zh';
  });

  const handleLanguageChange = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Language Switcher Bar */}
      <div className={`${themes[theme].background} border-b ${themes[theme].border} transition-colors duration-200`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex justify-end">
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700/60 text-xs font-semibold shadow-xs">
            <Globe className="w-3.5 h-3.5 mx-1.5 opacity-60" />
            <button
              type="button"
              onClick={() => handleLanguageChange('zh')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                lang === 'zh'
                  ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              中文
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                lang === 'en'
                  ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </div>

      {/* 1. Hero Section with Live Market Monitor */}
      <HeroSection 
        theme={theme} 
        onThemeChange={onThemeChange}
        onNavigateToJournal={() => navigate('/journal')}
        onNavigateToAdmin={user ? () => navigate('/admin') : undefined}
        onNavigateToAbout={() => navigate('/about')}
        user={user}
        lang={lang}
      />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* 3. Live Market Index Analytics */}
          <MarketOverview theme={theme} lang={lang} user={user} />

          {/* 2. Personalized Main Account Portfolio Snapshot */}
          <PortfolioPreview theme={theme} user={user} lang={lang} />

          {/* 4. Interactive Trading Command Suite */}
          <FeaturesGrid 
            theme={theme} 
            user={user} 
            onNavigateToJournal={(tab) => navigate(tab ? `/journal?tab=${tab}` : '/journal')}
            lang={lang}
          />
        </div>
      </main>
    </div>
  );
}


