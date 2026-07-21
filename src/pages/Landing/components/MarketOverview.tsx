import { TrendingUp } from 'lucide-react';
import { AnimatedChart } from './AnimatedChart';
import { InternalLink } from '../../../shared/components';
import { Theme, themes } from '../../../lib/theme';
import { landingTranslations, Language } from '../i18n';

interface MarketOverviewProps {
  theme: Theme;
  lang?: Language;
}

export function MarketOverview({ theme, lang = 'zh' }: MarketOverviewProps) {
  const t = landingTranslations[lang].marketAnalytics;

  return (
    <div className={`mb-16 ${themes[theme].card} rounded-2xl p-6 sm:p-8 shadow-xl border ${themes[theme].border} transition-colors duration-200`}>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold tracking-tight ${themes[theme].text}`}>
            {t.title}
          </h2>
          <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-70 mt-1`}>
            {t.subtitle}
          </p>
        </div>
        <InternalLink
          to="/journal"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
          title="Access your complete trading dashboard"
        >
          <span>{t.openWorkspace}</span>
          <TrendingUp className="w-4 h-4" />
        </InternalLink>
      </div>
      <AnimatedChart theme={theme} lang={lang} />
    </div>
  );
}

