import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { HeroSection } from './components/HeroSection';
import { MarketOverview } from './components/MarketOverview';
import { PortfolioPreview } from './components/PortfolioPreview';
import { FeaturesGrid } from './components/FeaturesGrid';
import { Theme, themes } from '../../lib/theme';
import type { User } from '../../lib/services/types';
import { isCloudflareEnv } from '../../lib/services';
import { landingTranslations } from './i18n';
import { useLandingWebMcp } from './hooks/useLandingWebMcp';
import { WebMcpBadge } from '../../lib/webmcp/components/WebMcpBadge';
import { WebMcpGuideModal } from '../../lib/webmcp/components/WebMcpGuideModal';
import { useLanguage } from '../../lib/context/LanguageContext';

interface LandingProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  user: User | null;
}

export function Landing({ theme, onThemeChange, user }: LandingProps) {
  const navigate = useNavigate();
  const [isAiGuideOpen, setIsAiGuideOpen] = useState(false);
  const { lang, setLang } = useLanguage();

  const webMcp = useLandingWebMcp({
    userId: user?.id,
    isAuthenticated: Boolean(user),
    currentTheme: theme,
    currentLang: lang,
    onNavigate: (path) => navigate(path),
    onThemeChange,
    onLanguageChange: setLang,
  });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Optional Top Bar for WebMCP Status in non-Cloudflare environments */}
      {!isCloudflareEnv && (
        <div className={`${themes[theme].background} border-b ${themes[theme].border} transition-colors duration-200`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
            <WebMcpBadge
              theme={theme}
              toolCount={webMcp.registeredToolCount}
              isSupported={webMcp.isSupported}
              isReady={webMcp.isReady}
              pageTitle="主页 / 概览"
              customTools={webMcp.tools}
            />
          </div>
        </div>
      )}

      {/* Top Disclaimer Alert Bar */}
      <div className="bg-amber-500/10 dark:bg-amber-500/5 border-b border-amber-500/20 dark:border-amber-500/10 py-2.5 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0" />
          <span>{landingTranslations[lang].hero.disclaimer}</span>
        </div>
      </div>

      {/* 1. Hero Section with Live Market Monitor */}
      <HeroSection 
        theme={theme} 
        onThemeChange={onThemeChange}
        onNavigateToJournal={() => navigate('/journal')}
        onNavigateToAdmin={user ? () => navigate('/admin') : undefined}
        onNavigateToAbout={() => navigate('/about')}
        onOpenAiGuide={() => setIsAiGuideOpen(true)}
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
            onNavigateToJournal={(tab) => navigate(isCloudflareEnv || !tab ? '/journal' : `/journal?tab=${tab}`)}
            lang={lang}
          />
        </div>
      </main>

      {/* Footer Disclaimer */}
      <footer className={`${themes[theme].background} border-t ${themes[theme].border} transition-colors duration-200 py-8 mt-auto`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
          <p className={`text-xs ${themes[theme].text} opacity-60 leading-relaxed max-w-2xl mx-auto`}>
            {lang === 'zh' 
              ? '免责声明：本网站内容仅作为分享，不构成任何投资意见。交易有风险，入市需谨慎。' 
              : 'Disclaimer: The content on this website is for sharing only and does not constitute any investment advice. Trading involves risks; please proceed with caution.'}
          </p>
          <p className={`text-[10px] ${themes[theme].text} opacity-40`}>
            &copy; {new Date().getFullYear()} Trader Analytics. All rights reserved.
          </p>
        </div>
      </footer>

      {/* WebMCP AI Assistant Guidance Modal */}
      <WebMcpGuideModal
        isOpen={isAiGuideOpen}
        onClose={() => setIsAiGuideOpen(false)}
        theme={theme}
        pageTitle="交易系统主页"
        customTools={webMcp.tools}
        isReady={webMcp.isReady}
        registeredCount={webMcp.registeredToolCount}
      />
    </div>
  );
}


