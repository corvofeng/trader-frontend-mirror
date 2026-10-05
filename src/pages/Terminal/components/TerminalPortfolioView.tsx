import React, { useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Layers, ShieldCheck, DollarSign, Activity } from 'lucide-react';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import type { Holding } from '../../../lib/services/types';
import { HoldingsTable } from '../../../features/portfolio/components/HoldingsTable';
import { OptionsPortfolio } from '../../../features/options/components/OptionsPortfolio';
import { PortfolioAnalysisPanel } from '../../../features/portfolio/components/PortfolioAnalysisPanel';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';

interface TerminalPortfolioViewProps {
  theme: Theme;
  selectedAccountId: string | null;
  holdings: Holding[];
  isPortfolioLoading: boolean;
  onRefresh: () => void;
  refreshKey: number;
}

type PortfolioSubTab = 'all' | 'stocks' | 'options' | 'analysis';

export const TerminalPortfolioView: React.FC<TerminalPortfolioViewProps> = ({
  theme,
  selectedAccountId,
  holdings,
  isPortfolioLoading,
  onRefresh,
  refreshKey,
}) => {
  const { currencyConfig } = useCurrency();
  const [subTab, setSubTab] = useState<PortfolioSubTab>('all');

  // Holdings 分页与排序状态
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [holdingsPerPage, setHoldingsPerPage] = useState(10);
  const [holdingsSort, setHoldingsSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'total_value',
    direction: 'desc',
  });

  // 计算股票现货总市值
  const totalStockValue = React.useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.total_value || 0), 0);
  }, [holdings]);

  // 计算总盈亏与当日盈亏
  const totalProfitLoss = React.useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.profit_loss || 0), 0);
  }, [holdings]);

  const dailyProfitLoss = React.useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.daily_profit_loss || 0), 0);
  }, [holdings]);

  const isPositiveDaily = dailyProfitLoss >= 0;
  const isPositiveTotal = totalProfitLoss >= 0;

  // 排序与分页
  const sortedHoldings = React.useMemo(() => {
    const list = [...holdings];
    list.sort((a, b) => {
      const field = holdingsSort.field as keyof Holding;
      const valA = a[field] ?? 0;
      const valB = b[field] ?? 0;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return holdingsSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return holdingsSort.direction === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
    return list;
  }, [holdings, holdingsSort]);

  const totalHoldingsPages = Math.ceil(sortedHoldings.length / holdingsPerPage) || 1;
  const paginatedHoldings = React.useMemo(() => {
    const start = (holdingsPage - 1) * holdingsPerPage;
    return sortedHoldings.slice(start, start + holdingsPerPage);
  }, [sortedHoldings, holdingsPage, holdingsPerPage]);

  const handleHoldingsSort = (field: string) => {
    setHoldingsSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  return (
    <div className="space-y-4 pb-20">
      {/* 顶部 M3 Tonal Surface: 账户统一资产卡片 */}
      <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-6 border ${themes[theme].border} fin-card-elevated relative overflow-hidden transition-all duration-200`}>
        <div className="fin-specular-line" aria-hidden="true" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                综合资产总览 (股票+期权)
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Live
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl sm:text-4xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white font-sans">
                {formatCurrency(totalStockValue, currencyConfig)}
              </span>
              <span className="text-xs text-slate-500 dark:text-zinc-400">现货总值</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onRefresh}
              className={`p-2 rounded-xl border ${themes[theme].border} ${themes[theme].secondary} btn-tactile text-slate-600 dark:text-zinc-300 hover:text-blue-600`}
              title="刷新资产"
            >
              <RefreshCw className={`w-4 h-4 ${isPortfolioLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4格财务核心指标栅格 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-200/60 dark:border-zinc-800/60">
          <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800/40">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">当日盈亏</div>
            <div className={`mt-0.5 text-sm sm:text-base font-bold tabular-nums flex items-center gap-1 ${
              isPositiveDaily ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'
            }`}>
              {isPositiveDaily ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {formatCurrency(dailyProfitLoss, currencyConfig)}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800/40">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">累计盈亏</div>
            <div className={`mt-0.5 text-sm sm:text-base font-bold tabular-nums flex items-center gap-1 ${
              isPositiveTotal ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'
            }`}>
              {formatCurrency(totalProfitLoss, currencyConfig)}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800/40">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">现货持仓只数</div>
            <div className="mt-0.5 text-sm sm:text-base font-bold tabular-nums text-slate-800 dark:text-zinc-200">
              {holdings.length} 只标的
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800/40">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">对冲联动状态</div>
            <div className="mt-0.5 text-sm sm:text-base font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              综合保证金生效
            </div>
          </div>
        </div>
      </div>

      {/* M3 Filter Chips: 资产子类别快速切换 */}
      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-1">
        {[
          { id: 'all' as PortfolioSubTab, label: '全部持仓', icon: Layers },
          { id: 'stocks' as PortfolioSubTab, label: '股票现货', icon: DollarSign },
          { id: 'options' as PortfolioSubTab, label: '期权与策略', icon: ShieldCheck },
          { id: 'analysis' as PortfolioSubTab, label: 'AI 组合分析', icon: Activity },
        ].map((chip) => {
          const Icon = chip.icon;
          const isSelected = subTab === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setSubTab(chip.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap btn-tactile transition-all duration-150 ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                  : 'bg-white/80 dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-300 border border-slate-200/80 dark:border-zinc-800/80 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* 主视图内容：深度复用现有组件 */}
      <div className="space-y-4">
        {/* 1. 现货表格 (当选择 全部 或 现货 时展示) */}
        {(subTab === 'all' || subTab === 'stocks') && (
          <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>现货标的持仓</span>
                <span className="text-xs font-normal text-slate-500 dark:text-zinc-400">
                  ({holdings.length} 条)
                </span>
              </h2>
            </div>
            <HoldingsTable
              theme={theme}
              holdings={holdings}
              paginatedHoldings={paginatedHoldings}
              holdingsPage={holdingsPage}
              holdingsPerPage={holdingsPerPage}
              totalHoldingsPages={totalHoldingsPages}
              onHoldingsPageChange={setHoldingsPage}
              onHoldingsPerPageChange={setHoldingsPerPage}
              holdingsSort={holdingsSort}
              onHoldingsSort={handleHoldingsSort}
              isLoading={isPortfolioLoading}
            />
          </div>
        )}

        {/* 2. 期权持仓与策略 (当选择 全部 或 期权 时展示) */}
        {(subTab === 'all' || subTab === 'options') && (
          <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>期权头寸与策略对冲</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40">
                  Greeks & Combos
                </span>
              </h2>
            </div>
            <OptionsPortfolio
              theme={theme}
              selectedAccountId={selectedAccountId}
              refreshKey={refreshKey}
              hideMobileFab={true}
            />
          </div>
        )}

        {/* 3. 组合分析 (当选择 分析 时展示) */}
        {subTab === 'analysis' && (
          <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
            <PortfolioAnalysisPanel
              theme={theme}
              selectedAccountId={selectedAccountId}
            />
          </div>
        )}
      </div>
    </div>
  );
};
