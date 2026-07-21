import { TrendingUp, Sigma, ArrowRight, ShieldCheck, Activity, LineChart, Zap } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';

interface HeroSectionProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onNavigateToJournal: () => void;
  onNavigateToOptions: () => void;
  onNavigateToAdmin?: () => void;
  onNavigateToAbout: () => void;
}

export function HeroSection({ 
  theme, 
  onNavigateToJournal, 
  onNavigateToOptions,
}: HeroSectionProps) {
  return (
    <div className={`relative overflow-hidden ${themes[theme].background} border-b ${themes[theme].border} transition-colors duration-200`}>
      {/* Background glow accents */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Hero Copy */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold tracking-wide uppercase mb-6">
              <Zap className="w-3.5 h-3.5" />
              <span>Real-Time Options & Portfolio Journal</span>
            </div>

            <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight ${themes[theme].text} mb-6 leading-tight sm:leading-none`}>
              Precision Analytics for <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                Stock & Options Traders
              </span>
            </h1>

            <p className={`text-base sm:text-lg ${themes[theme].text} opacity-80 mb-8 max-w-xl leading-relaxed`}>
              Track multi-account portfolios, monitor real-time option chains & Greeks, analyze implied volatility surfaces, and log trade execution metrics.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                onClick={onNavigateToJournal}
                className={`inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${themes[theme].primary} active:scale-[0.98] group`}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Open Trading Journal
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onNavigateToOptions}
                className={`inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${themes[theme].secondary} border ${themes[theme].border} active:scale-[0.98]`}
              >
                <Sigma className="w-4 h-4 mr-2 text-indigo-500" />
                Options Workbench
              </button>
            </div>

            {/* Micro Trust Strip */}
            <div className="mt-10 pt-6 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center gap-6 text-xs opacity-70">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Multi-Account Storage</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-blue-500" />
                <span>Live WebSocket Feeds</span>
              </div>
            </div>
          </div>

          {/* Right Column: Tactical Financial Dashboard Card */}
          <div className="lg:col-span-5">
            <div className={`rounded-2xl p-6 border ${themes[theme].border} ${themes[theme].card} shadow-xl relative overflow-hidden backdrop-blur-sm`}>
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-zinc-800/80 pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold tracking-wider uppercase opacity-75">Live Market Monitor</span>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                  SPY $512.40 (+1.2%)
                </span>
              </div>

              {/* Stat Grid */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="p-3.5 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/40 dark:border-zinc-700/40">
                  <div className="text-xs opacity-70 mb-1">Portfolio Win Rate</div>
                  <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">74.8%</div>
                  <div className="text-[11px] text-emerald-500 mt-0.5">↑ 4.2% this month</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/40 dark:border-zinc-700/40">
                  <div className="text-xs opacity-70 mb-1">Option Delta (Δ)</div>
                  <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">+0.48</div>
                  <div className="text-[11px] opacity-60 mt-0.5">Vega: 0.12 · Gamma: 0.03</div>
                </div>
              </div>

              {/* Sparkline Visual Component */}
              <div className="p-4 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/40 dark:border-zinc-700/40">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="font-semibold flex items-center gap-1.5">
                    <LineChart className="w-3.5 h-3.5 text-blue-500" />
                    Intraday Options PnL
                  </span>
                  <span className="font-mono text-emerald-500 font-bold">+$1,420.50</span>
                </div>

                <div className="h-16 flex items-end gap-1.5 pt-2">
                  {[35, 42, 38, 55, 62, 58, 74, 82, 78, 95].map((h, i) => (
                    <div 
                      key={i} 
                      className="flex-1 bg-gradient-to-t from-blue-600/40 to-blue-500 rounded-t transition-all duration-300 hover:opacity-100"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
