import { BarChart3, BookOpenCheck, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';
import { InternalLink } from '../../../shared/components';
import { Theme, themes } from '../../../lib/theme';
import type { User } from '../../../lib/services/types';
import { landingTranslations, Language } from '../i18n';

interface FeaturesGridProps {
  theme: Theme;
  user: User | null;
  onNavigateToJournal?: (tab?: string) => void;
  lang?: Language;
}

export function FeaturesGrid({ theme, user, onNavigateToJournal, lang = 'zh' }: FeaturesGridProps) {
  const t = landingTranslations[lang].commandSuite;

  return (
    <div className="mb-16">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-3 border border-indigo-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t.badge}</span>
        </div>
        <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${themes[theme].text}`}>
          {t.title}
        </h2>
        <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-70 mt-2`}>
          {t.subtitle}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">

        {/* Card 2: Portfolio Analytics */}
        <div className={`${themes[theme].card} rounded-2xl p-7 border ${themes[theme].border} ${themes[theme].cardHover} transition-all duration-300 shadow-md hover:shadow-xl relative overflow-hidden group flex flex-col justify-between`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-sm">
                <BarChart3 className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-semibold">
                {user ? t.portfolio.badgeActive : t.portfolio.badgeDefault}
              </span>
            </div>

            <h3 className={`text-xl font-bold tracking-tight mb-2.5 ${themes[theme].text}`}>
              {t.portfolio.title}
            </h3>
            <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-75 leading-relaxed mb-6`}>
              {t.portfolio.description}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-200/50 dark:border-zinc-800/80 mt-auto">
            {onNavigateToJournal ? (
              <button
                type="button"
                onClick={() => onNavigateToJournal('portfolio')}
                className="w-full inline-flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 group/btn"
              >
                <span>{t.portfolio.cta}</span>
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </button>
            ) : (
              <InternalLink
                to="/journal?tab=portfolio"
                className="w-full inline-flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 group/btn"
              >
                <span>{t.portfolio.cta}</span>
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </InternalLink>
            )}
          </div>
        </div>

        {/* Card 3: Trade Journal & Plans */}
        <div className={`${themes[theme].card} rounded-2xl p-7 border ${themes[theme].border} ${themes[theme].cardHover} transition-all duration-300 shadow-md hover:shadow-xl relative overflow-hidden group flex flex-col justify-between`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-sm">
                <BookOpenCheck className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-emerald-500" />
                {t.journal.badge}
              </span>
            </div>

            <h3 className={`text-xl font-bold tracking-tight mb-2.5 ${themes[theme].text}`}>
              {t.journal.title}
            </h3>
            <p className={`text-xs sm:text-sm ${themes[theme].text} opacity-75 leading-relaxed mb-6`}>
              {t.journal.description}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-200/50 dark:border-zinc-800/80 mt-auto">
            {onNavigateToJournal ? (
              <button
                type="button"
                onClick={() => onNavigateToJournal('trades')}
                className="w-full inline-flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 group/btn"
              >
                <span>{t.journal.cta}</span>
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </button>
            ) : (
              <InternalLink
                to="/journal?tab=trades"
                className="w-full inline-flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 group/btn"
              >
                <span>{t.journal.cta}</span>
                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
              </InternalLink>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


