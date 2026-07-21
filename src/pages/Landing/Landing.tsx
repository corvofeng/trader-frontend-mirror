import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Globe } from 'lucide-react';
import { HeroSection } from './components/HeroSection';
import { MarketOverview } from './components/MarketOverview';
import { PortfolioPreview } from './components/PortfolioPreview';
import { FeaturesGrid } from './components/FeaturesGrid';
import { Theme, themes } from '../../lib/theme';
import type { User } from '../../lib/services/types';
import { landingTranslations, Language } from './i18n';

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

  const tCta = landingTranslations[lang].ctaBanner;

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
        onNavigateToOptions={() => navigate('/options')}
        onNavigateToAdmin={user ? () => navigate('/admin') : undefined}
        onNavigateToAbout={() => navigate('/about')}
        user={user}
        lang={lang}
      />
      
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {/* 2. Personalized Main Account Portfolio Snapshot */}
          <PortfolioPreview theme={theme} user={user} lang={lang} />

          {/* 3. Live Market Index Analytics */}
          <MarketOverview theme={theme} lang={lang} />

          {/* 4. Interactive Trading Command Suite */}
          <FeaturesGrid 
            theme={theme} 
            user={user} 
            onNavigateToOptions={() => navigate('/options')}
            onNavigateToJournal={(tab) => navigate(tab ? `/journal?tab=${tab}` : '/journal')}
            lang={lang}
          />
          
          {/* 5. Bottom Action Call-To-Action Banner */}
          <div className={`relative overflow-hidden rounded-3xl p-8 sm:p-12 ${themes[theme].card} border ${themes[theme].border} shadow-2xl text-center backdrop-blur-xl mb-12 bg-gradient-to-br from-blue-600/10 via-indigo-500/5 to-cyan-500/10`}>
            <div className="max-w-2xl mx-auto space-y-4">
              <h3 className={`text-2xl sm:text-3xl font-extrabold ${themes[theme].text} tracking-tight`}>
                {tCta.title}
              </h3>
              <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-75 leading-relaxed`}>
                {tCta.description}
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/journal')}
                  className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-sm transition-all ${themes[theme].primary} shadow-lg hover:shadow-blue-500/25 active:scale-95 flex items-center justify-center gap-2 group`}
                >
                  <span>{tCta.journalBtn}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/options')}
                  className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-sm transition-all ${themes[theme].secondary} border ${themes[theme].border} active:scale-95 flex items-center justify-center gap-2`}
                >
                  <span>{tCta.optionsBtn}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


