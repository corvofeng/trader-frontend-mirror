import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  UserPlus,
  LogOut,
  PieChart as PieIcon,
  FileText,
  Copy,
  Check,
  AlertCircle,
  ShieldAlert,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  PlusCircle,
  Sparkles,
  Award,
  Camera,
  ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Theme, themes } from '../../../lib/theme';
import { portfolioService, optionsService, cashFlowService } from '../../../lib/services';
import type { CashFlowItem, Holding } from '../../../lib/services/types';
import { getCounterpartyMeta } from './CashFlowCounterpartyCharts';
import {
  calculateCounterpartyPrincipals,
  calculateAnnualDividendPlan,
  simulateNewMemberEntry,
  generateDividendNoticeText,
  generatePositionNoticeText,
  getAvailableYears,
  DividendPlanResult,
  CounterpartyPrincipal,
  FeeCalculationMode,
} from './cashFlowDividendUtils';
import { CashFlowDividendShareModal } from './CashFlowDividendShareModal';

interface CashFlowDividendViewProps {
  theme: Theme;
  accountAlias: string;
  items: CashFlowItem[];
  allCounterparties: string[];
  isMasked: boolean;
  onRefreshFlows?: () => void;
}

type SubTabType = 'annual' | 'new_member' | 'exit' | 'position' | 'rules';

export function CashFlowDividendView({
  theme,
  accountAlias,
  items,
  allCounterparties,
  isMasked,
  onRefreshFlows
}: CashFlowDividendViewProps) {
  // Section collapse state
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('annual');

  // Selected year & settlement date for annual dividend
  const availableYears = useMemo(() => getAvailableYears(items), [items]);
  const [selectedYear, setSelectedYear] = useState<number>(() => availableYears[0] || new Date().getFullYear());
  const [settleDate, setSettleDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Fee Calculation Mode (默认超额累进制: 5%以内10%, 超出5%收50%)
  const [feeMode, setFeeMode] = useState<FeeCalculationMode>('progressive');
  const standardFeeRate = 0.10; // 10% for fallback fixed mode
  const [reentryFeeRate, setReentryFeeRate] = useState<number>(0.50); // 50% for Rule 4 penalty

  // Collapsible detailed calculation state for each partner
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());

  const handleTogglePartnerExpand = (rawName: string) => {
    setExpandedPartners((prev) => {
      const next = new Set(prev);
      if (next.has(rawName)) {
        next.delete(rawName);
      } else {
        next.add(rawName);
      }
      return next;
    });
  };

  const handleToggleAllExpand = (allNames: string[]) => {
    if (expandedPartners.size === allNames.length) {
      setExpandedPartners(new Set());
    } else {
      setExpandedPartners(new Set(allNames));
    }
  };

  // January withdrawal exclusion: 1月份出金视为去年的资金分配，不扣减本金
  const [excludeJanuaryWithdrawals, setExcludeJanuaryWithdrawals] = useState<boolean>(true);

  // 1. Compute principals & share ratios for counterparties
  const principals: CounterpartyPrincipal[] = useMemo(() => {
    return calculateCounterpartyPrincipals(items, selectedYear, {
      excludeJanuaryWithdrawals,
    });
  }, [items, selectedYear, excludeJanuaryWithdrawals]);

  const totalPoolPrincipal = useMemo(() => {
    return principals.reduce((sum, p) => sum + p.netPrincipal, 0);
  }, [principals]);

  // Dual-linked states: Account Total Asset & Total Profit
  // Core Business Rule: Total Profit = Current Total Account Asset - Total Pool Principal
  const [manualTotalAsset, setManualTotalAsset] = useState<number | null>(null);
  const [manualProfit, setManualProfit] = useState<number | null>(null);
  const [isLoadingProfit, setIsLoadingProfit] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsTotalValue, setHoldingsTotalValue] = useState<number>(0);

  // Effective Total Asset and Profit
  const accountTotalAsset = manualTotalAsset !== null
    ? manualTotalAsset
    : (manualProfit !== null ? totalPoolPrincipal + manualProfit : totalPoolPrincipal + 1000);

  const accountProfit = manualProfit !== null
    ? manualProfit
    : (accountTotalAsset - totalPoolPrincipal);

  const handleUpdateTotalAsset = (newAsset: number) => {
    setManualTotalAsset(newAsset);
    setManualProfit(newAsset - totalPoolPrincipal);
  };

  const handleUpdateProfit = (newProfit: number) => {
    setManualProfit(newProfit);
    setManualTotalAsset(totalPoolPrincipal + newProfit);
  };

  // Copy indicator state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // New member simulation form state
  const [newMemberName, setNewMemberName] = useState('新合伙人');
  const [newMemberAmount, setNewMemberAmount] = useState<number>(50000);

  // Exit simulation state
  const [exitCounterparty, setExitCounterparty] = useState<string>('');
  const [exitNoticeConfirmed, setExitNoticeConfirmed] = useState(true);

  // Batch recording state
  const [isRecordingFlows, setIsRecordingFlows] = useState(false);
  const [isFlowsRecorded, setIsFlowsRecorded] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedSharePartner, setSelectedSharePartner] = useState<string | undefined>(undefined);

  // 2. Fetch current account latest profit and holdings
  const fetchAccountProfitAndHoldings = useCallback(async () => {
    if (!accountAlias) return;
    setIsLoadingProfit(true);
    try {
      const isOptionsAccount = accountAlias.includes('option') || accountAlias.includes('gjzq');

      if (isOptionsAccount) {
        const resp = await optionsService.getOptionsPortfolio('mock-user-id', accountAlias);
        if (resp.data) {
          const totalVal = resp.data.totalValue || 0;
          setHoldingsTotalValue(totalVal);
          const bal = resp.data.balance || 0;
          if (bal > 0) {
            handleUpdateTotalAsset(bal);
          } else if (resp.data.totalProfitLoss !== undefined) {
            handleUpdateProfit(resp.data.totalProfitLoss);
          }
        }
      } else {
        const resp = await portfolioService.getHoldings(accountAlias);
        if (resp.data && Array.isArray(resp.data)) {
          const list = resp.data as Holding[];
          setHoldings(list);
          const totalVal = list.reduce((sum, h) => sum + (h.total_value || 0), 0);
          setHoldingsTotalValue(totalVal);

          // Try fetching recent trend data to obtain latest total portfolio asset (stock value + cash balance)
          const today = new Date().toISOString().split('T')[0];
          const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().split('T')[0];
          const trendResp = await portfolioService.getTrendData('mock-user-id', sixMonthsAgo, today, accountAlias);
          if (trendResp.data && Array.isArray(trendResp.data) && trendResp.data.length > 0) {
            const latestVal = trendResp.data[trendResp.data.length - 1].value;
            if (latestVal > 0) {
              handleUpdateTotalAsset(latestVal);
              return;
            }
          }

          // If trend data not available, use holding floating profit to derive asset
          const totalPnl = list.reduce((sum, h) => sum + (h.profit_loss || 0), 0);
          if (totalPnl !== 0) {
            handleUpdateProfit(totalPnl);
          }
        }
      }
    } catch (err) {
      console.warn('Could not auto-fetch account portfolio profit, keeping current asset/profit:', err);
    } finally {
      setIsLoadingProfit(false);
    }
  }, [accountAlias, totalPoolPrincipal]);

  useEffect(() => {
    fetchAccountProfitAndHoldings();
  }, [fetchAccountProfitAndHoldings]);

  // Sync default exit counterparty
  useEffect(() => {
    if (!exitCounterparty && principals.length > 0) {
      setExitCounterparty(principals[0].rawName);
    }
  }, [principals, exitCounterparty]);

  // 3. Compute Annual Dividend Plan
  const dividendPlan: DividendPlanResult = useMemo(() => {
    return calculateAnnualDividendPlan({
      year: selectedYear,
      totalAccountAsset: accountTotalAsset,
      totalProfit: accountProfit,
      principals,
      feeMode,
      standardFeeRate,
      reentryFeeRate,
    });
  }, [selectedYear, accountTotalAsset, accountProfit, principals, feeMode, standardFeeRate, reentryFeeRate]);

  // 4. Compute New Member Simulation
  const newMemberSim = useMemo(() => {
    return simulateNewMemberEntry({
      currentProfit: accountProfit,
      principals,
      newMemberName,
      newMemberAmount,
      standardFeeRate,
    });
  }, [accountProfit, principals, newMemberName, newMemberAmount, standardFeeRate]);

  // Helper for masking name
  const getDisplayName = useCallback(
    (raw: string) => {
      const meta = getCounterpartyMeta(raw, allCounterparties, isMasked);
      return meta ? meta.displayName : raw;
    },
    [allCounterparties, isMasked]
  );

  // Copy helper
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('已复制到剪贴板，可直接发送微信群或合伙人');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // One-click batch record dividend cash flows
  const handleRecordDividendFlows = async () => {
    if (!accountAlias || !dividendPlan.isEligibleForDividend || dividendPlan.items.length === 0) {
      toast.error('当前无有效分红可供录入');
      return;
    }

    const confirmMsg = `确认要将本期总计 ¥${dividendPlan.totalNetDividend.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 的分红出金批量录入当前账户流水吗？\n将为 ${dividendPlan.items.length} 位合伙人生成出金流水。`;
    if (!window.confirm(confirmMsg)) return;

    setIsRecordingFlows(true);
    let successCount = 0;
    try {
      for (const item of dividendPlan.items) {
        if (item.netDividend <= 0) continue;
        const res = await cashFlowService.createCashFlow(accountAlias, {
          flow_date: settleDate,
          flow_type: 'withdraw',
          amount: item.netDividend.toFixed(2),
          currency: 'CNY',
          counterparty: item.rawName,
          description: `【${selectedYear}年度分红】净分红发放`,
          benefit_note: `出资¥${item.netPrincipal.toLocaleString('zh-CN')} (占比${(item.shareRatio * 100).toFixed(1)}%)，毛利¥${item.grossProfitShare.toFixed(2)}，扣手续费¥${item.feeAmount.toFixed(2)}`,
          external_id: `div-${selectedYear}-${Date.now().toString().slice(-6)}-${item.rawName.slice(0, 3)}`,
          source: 'manual',
        });
        if (!res.error) successCount++;
      }
      toast.success(`成功生成 ${successCount} 笔分红出金流水记录！`);
      setIsFlowsRecorded(true);
      if (onRefreshFlows) onRefreshFlows();
      // 自动弹出分享截图弹窗，方便合伙人分红对账与微信分享
      setIsShareModalOpen(true);
    } catch (err: any) {
      console.error('Failed to record dividend flows:', err);
      toast.error(err?.message || '批量录入分红流水失败');
    } finally {
      setIsRecordingFlows(false);
    }
  };

  const formatMoney = (val: number) => {
    return `¥ ${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className={`${themes[theme].card} rounded-xl border border-slate-200/90 dark:border-zinc-800 shadow-sm overflow-hidden transition-all`}>
      {/* Header Banner */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800/80 bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-amber-50/20 dark:from-blue-950/20 dark:via-indigo-950/15 dark:to-amber-950/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs shrink-0 mt-0.5 sm:mt-0">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`text-base sm:text-lg font-bold ${themes[theme].text}`}>
                  合伙分红与收益结算中心 (Dividend & Settlement)
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-medium border border-amber-300 dark:border-amber-800">
                  零管理费 · 仅收盈利提成
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                基于合伙投资 5 项约定：盈利后均分准入 · 3日内仓位披露 · 离场再入50%手续费 · 元旦后盈利强制分红
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${themes[theme].secondary} transition-all`}
            >
              <span>{isExpanded ? '收起面板' : '展开结算中心'}</span>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 sm:p-6 space-y-6">
          {/* Real-time Profit & Condition Bar */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  accountProfit > 0
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : accountProfit < 0
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
                }`}
              >
                {accountProfit > 0 ? (
                  <TrendingUp className="w-6 h-6" />
                ) : accountProfit < 0 ? (
                  <TrendingDown className="w-6 h-6" />
                ) : (
                  <Sparkles className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                    本期累计可分配利润 (当前账户总金额 - 资金池总本金)
                  </span>
                  <button
                    type="button"
                    onClick={fetchAccountProfitAndHoldings}
                    disabled={isLoadingProfit}
                    title="从账户最新总资产与持仓重新同步"
                    className="text-blue-500 hover:text-blue-600 p-0.5 rounded transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProfit ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                  <span
                    className={`text-xl sm:text-2xl font-bold font-mono ${
                      accountProfit > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : accountProfit < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : themes[theme].text
                    }`}
                  >
                    {accountProfit > 0 ? '+' : ''}
                    {formatMoney(accountProfit)}
                  </span>
                  <span
                    className={`text-xs sm:text-sm font-bold font-mono px-2 py-0.5 rounded-md border ${
                      accountProfit > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                        : accountProfit < 0
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700'
                    }`}
                    title="当期总收益率 = 当期累计总利润 ÷ 资金池有效总成本本金"
                  >
                    收益率: {totalPoolPrincipal > 0 ? `${accountProfit >= 0 ? '+' : ''}${((accountProfit / totalPoolPrincipal) * 100).toFixed(2)}%` : '0.00%'}
                  </span>
                  {accountProfit > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-medium">
                      <Check className="w-3 h-3" /> 盈利中 · 触发强制分红 & 准入开放
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-medium">
                      <AlertCircle className="w-3 h-3" /> 规则保护生效：免收管理费 · 亏损不分红 · 拦截新进资金
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Linked Dual Inputs: Total Account Asset and Profit */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 flex-wrap">
              {/* Account Total Asset Input */}
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-800/80 p-2 rounded-lg border border-slate-200 dark:border-zinc-700">
                <span className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap pl-1 font-medium">
                  账户总金额:
                </span>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">¥</span>
                  <input
                    type="number"
                    step="1000"
                    value={Math.round(accountTotalAsset * 100) / 100}
                    onChange={(e) => handleUpdateTotalAsset(parseFloat(e.target.value) || 0)}
                    title="当前账户全部资产总规模（持仓市值 + 可用资金）"
                    className="w-32 pl-5 pr-2 py-1 text-xs font-mono font-bold rounded border border-slate-300 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Profit Input */}
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-800/80 p-2 rounded-lg border border-slate-200 dark:border-zinc-700">
                <span className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap pl-1 font-medium">
                  本期总利润:
                </span>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">¥</span>
                  <input
                    type="number"
                    step="100"
                    value={Math.round(accountProfit * 100) / 100}
                    onChange={(e) => handleUpdateProfit(parseFloat(e.target.value) || 0)}
                    title="根据 (账户总额 - 资金池总本金) 算出的利润，也可在此直接输入目标利润"
                    className="w-28 pl-5 pr-2 py-1 text-xs font-mono font-bold rounded border border-slate-300 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleUpdateProfit(1000)}
                    className="px-1.5 py-1 rounded text-[11px] bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 text-slate-600 dark:text-zinc-300 font-mono"
                    title="填入用户约定案例: 1000元利润"
                  >
                    +1千
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateProfit(0)}
                    className="px-1.5 py-1 rounded text-[11px] bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 text-slate-600 dark:text-zinc-300 font-mono"
                    title="保本状态 (利润为0)"
                  >
                    0元
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Formula Breakdown Banner */}
          <div className="p-3 rounded-lg bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 flex flex-wrap items-center justify-between text-xs gap-2">
            <div className="flex flex-wrap items-center gap-1.5 font-mono">
              <span className="text-slate-500 dark:text-zinc-400 font-sans font-medium">收益计算公式:</span>
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                当前账户总金额 ({formatMoney(accountTotalAsset)})
              </span>
              <span className="text-slate-400">-</span>
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                资金池有效总本金 ({formatMoney(totalPoolPrincipal)})
              </span>
              <span className="text-slate-400">=</span>
              <span className={`font-bold ${accountProfit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                本期分配总利润 ({accountProfit > 0 ? '+' : ''}{formatMoney(accountProfit)} · 收益率 {totalPoolPrincipal > 0 ? `${accountProfit >= 0 ? '+' : ''}${((accountProfit / totalPoolPrincipal) * 100).toFixed(2)}%` : '0.00%'})
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">
              (收益占总成本比例 · 按出资份额 100% 对应均分)
            </span>
          </div>

          {/* Sub-Tabs Nav */}
          <div className="flex border-b border-slate-200 dark:border-zinc-800 overflow-x-auto gap-2 pb-px scrollbar-none">
            <button
              onClick={() => setActiveSubTab('annual')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                activeSubTab === 'annual'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <Coins className="w-4 h-4 text-amber-500" />
              <span>自然年强制分红结算</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                规则5
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('new_member')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                activeSubTab === 'new_member'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <UserPlus className="w-4 h-4 text-emerald-500" />
              <span>新人入场前置分红清算</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                规则2
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('exit')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                activeSubTab === 'exit'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>离场结算与再入50%追踪</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                规则4
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('position')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                activeSubTab === 'position'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <PieIcon className="w-4 h-4 text-purple-500" />
              <span>仓位分布披露 (3日出具)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                规则3
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('rules')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium rounded-t-lg transition-all border-b-2 whitespace-nowrap ${
                activeSubTab === 'rules'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>合伙准则与条款说明</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                全部条款
              </span>
            </button>
          </div>

          {/* TAB 1: Annual Mandatory Dividend Settlement */}
          {activeSubTab === 'annual' && (
            <div className="space-y-5">
              {/* Filter & Settlement Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-900/30 text-xs">
                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1 font-medium">结算自然年份</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y} 自然年 (元旦后首个交易日结算)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1 font-medium">结算执行日期</label>
                  <input
                    type="date"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1 font-medium flex items-center justify-between">
                    <span>手续费计提机制</span>
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">默认超额累进</span>
                  </label>
                  <select
                    value={feeMode}
                    onChange={(e) => setFeeMode(e.target.value as FeeCalculationMode)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 font-medium"
                  >
                    <option value="progressive">超额累进制 (5%以内10%, 超出50%) ⭐ 默认</option>
                    <option value="cliff_50">全额跳档制 (超5%全额按50%, 否则10%)</option>
                    <option value="fixed_10">固定费率 10% (基础约定标准)</option>
                    <option value="fixed_15">固定费率 15% 提成</option>
                    <option value="fixed_20">固定费率 20% 提成</option>
                    <option value="zero">0% 免收手续费</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-zinc-400 mb-1 font-medium">离场后重入惩罚费率</label>
                  <select
                    value={reentryFeeRate}
                    onChange={(e) => setReentryFeeRate(parseFloat(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 font-semibold text-rose-600 dark:text-rose-400"
                  >
                    <option value={0.50}>50% (规则4: 离场后重入惩罚费率)</option>
                    <option value={0.40}>40%</option>
                    <option value={0.30}>30%</option>
                  </select>
                </div>

                {/* January withdrawal exclusion toggle (Rule 5) */}
                <div className="sm:col-span-4 pt-2.5 mt-1 border-t border-slate-200/60 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={excludeJanuaryWithdrawals}
                      onChange={(e) => setExcludeJanuaryWithdrawals(e.target.checked)}
                      className="rounded border-slate-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="font-semibold text-slate-800 dark:text-zinc-200 text-xs">
                      排除1月份出金（视为上年度收益分配，不扣减本金底仓，不触发惩罚性离场）
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    💡 依据约定，元旦后的出金属于上一自然年分红提现，排除后可保持本金基准稳定
                  </span>
                </div>
              </div>

              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
                  <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">资金池总本金 (总成本)</span>
                  <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-zinc-100 mt-1">
                    {formatMoney(dividendPlan.totalPoolPrincipal)}
                  </div>
                  <span className="text-[11px] text-slate-400">共 {dividendPlan.items.length} 位在场合伙人</span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">本期分配总利润</span>
                    {dividendPlan.totalPoolPrincipal > 0 && dividendPlan.totalGrossProfit > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                        毛收益率 +{((dividendPlan.totalProfitRate || 0) * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-lg sm:text-xl font-bold font-mono mt-1 ${
                      dividendPlan.totalGrossProfit > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {formatMoney(dividendPlan.totalGrossProfit)}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {dividendPlan.isEligibleForDividend
                      ? `总成本毛收益率 ${(dividendPlan.totalProfitRate * 100).toFixed(2)}% · 100%对应分配`
                      : '无盈利不计提'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" /> 投资人分红总额 (实发)
                    </span>
                    {dividendPlan.totalPoolPrincipal > 0 && dividendPlan.totalNetDividend > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-200/70 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        净到手 +{((dividendPlan.totalNetDividendRate || 0) * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                  <div className="text-lg sm:text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                    {formatMoney(dividendPlan.totalNetDividend)}
                  </div>
                  <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
                    到手净收益率 {(dividendPlan.totalNetDividendRate * 100).toFixed(2)}% (扣提成后发还)
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-2xs">
                  <span className="text-xs text-indigo-700 dark:text-indigo-400 font-semibold flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" /> 管理人手续费收入 (您)
                  </span>
                  <div className="text-lg sm:text-xl font-bold font-mono text-indigo-700 dark:text-indigo-400 mt-1">
                    {formatMoney(dividendPlan.totalManagerFee)}
                  </div>
                  <span className="text-[11px] text-indigo-600/80 dark:text-indigo-400/70">
                    纯业绩提成收益（零管理费）
                  </span>
                </div>
              </div>

              {/* Status Banner */}
              {!dividendPlan.isEligibleForDividend && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs sm:text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">暂不执行分红结算:</strong> {dividendPlan.statusMessage}
                    <p className="mt-1 text-xs opacity-80">
                      提示：您可以在上方“调测金额”输入正数盈利（如 1000 元）立即预览分红计算效果。
                    </p>
                  </div>
                </div>
              )}

              {/* Breakdown Table */}
              <div className="border border-slate-200/90 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xs">
                <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                    <span>合伙人分红明细清算表</span>
                    <span className="text-xs font-normal text-slate-400 font-mono">
                      (共 {dividendPlan.items.length} 位出资人 · 点击每行可折叠/展开推导详情)
                    </span>
                  </span>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Expand/Collapse All Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleAllExpand(dividendPlan.items.map((i) => i.rawName))}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
                      title="一键展开或折叠全部合伙人计算推导过程"
                    >
                      {expandedPartners.size === dividendPlan.items.length && dividendPlan.items.length > 0 ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5 text-blue-500" />
                          <span>折叠全部详情</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
                          <span>展开全部计算推导 ({expandedPartners.size}/{dividendPlan.items.length})</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          generateDividendNoticeText({
                            accountAlias,
                            plan: dividendPlan,
                            settleDate,
                            isMasked,
                            getMaskName: getDisplayName,
                          }),
                          'dividend-bill'
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
                    >
                      {copiedKey === 'dividend-bill' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>复制微信结算账单</span>
                    </button>

                    <button
                      type="button"
                      disabled={!dividendPlan.isEligibleForDividend || dividendPlan.items.length === 0}
                      onClick={() => setIsShareModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors shadow-2xs"
                      title="生成客户分享截图（支持客户Hash脱敏）"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>📸 分享结算截图</span>
                    </button>

                    <button
                      type="button"
                      disabled={!dividendPlan.isEligibleForDividend || isRecordingFlows}
                      onClick={handleRecordDividendFlows}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors shadow-2xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>{isRecordingFlows ? '正在录入...' : '一键生成分红出金流水'}</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/50 text-slate-500 dark:text-zinc-400 font-semibold whitespace-nowrap">
                        <th className="py-2.5 pl-3 pr-1 text-center w-8"></th>
                        <th className="py-2.5 px-3">合伙人 (对手方)</th>
                        <th className="py-2.5 px-3 text-right">累计净本金 (成本)</th>
                        <th className="py-2.5 px-3 text-right">出资占比</th>
                        <th className="py-2.5 px-3 text-right">分配毛利润</th>
                        <th className="py-2.5 px-3 text-right">当期收益率 (毛/净)</th>
                        <th className="py-2.5 px-3 text-center">手续费率</th>
                        <th className="py-2.5 px-3 text-right">扣除手续费</th>
                        <th className="py-2.5 px-4 text-right">实发到手分红</th>
                        <th className="py-2.5 px-3 text-right">留存底仓本金</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                      {dividendPlan.items.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-400">
                            暂无活跃合伙人出资记录
                          </td>
                        </tr>
                      ) : (
                        dividendPlan.items.map((item) => {
                          const meta = getCounterpartyMeta(item.rawName, allCounterparties, isMasked);
                          const isExpanded = expandedPartners.has(item.rawName);
                          const hasExcessProfit = (item.tierDetail?.tier2Profit || 0) > 0;

                          return (
                            <div key={item.rawName} style={{ display: 'contents' }}>
                              {/* Main Data Row */}
                              <tr
                                onClick={() => handleTogglePartnerExpand(item.rawName)}
                                className={`cursor-pointer transition-colors ${
                                  isExpanded
                                    ? 'bg-blue-50/40 dark:bg-blue-950/20'
                                    : 'hover:bg-slate-50/70 dark:hover:bg-zinc-800/30'
                                }`}
                              >
                                {/* Toggle Chevron Button */}
                                <td className="py-3 pl-3 pr-1 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTogglePartnerExpand(item.rawName);
                                    }}
                                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
                                    title={isExpanded ? '点击折叠计算步骤' : '点击展开查看计算步骤'}
                                  >
                                    <ChevronDown
                                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                        isExpanded ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                                      }`}
                                    />
                                  </button>
                                </td>

                                {/* Counterparty Name */}
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: meta?.color || '#3b82f6' }}
                                    />
                                    <span className="font-semibold text-slate-800 dark:text-zinc-200 font-mono">
                                      {meta?.displayName || item.rawName}
                                    </span>
                                    {item.isReentered && (
                                      <span
                                        className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-semibold border border-rose-300 dark:border-rose-800"
                                        title="该合伙人当年曾离场出金并再次入金加入，按约定触发 50% 盈利提成"
                                      >
                                        ⚠️ 当年再入场 (50%)
                                      </span>
                                    )}
                                    <span className="text-[10px] text-blue-500/80 hover:text-blue-600 underline font-normal hidden sm:inline">
                                      {isExpanded ? '收起详情' : '查看计算'}
                                    </span>
                                  </div>
                                </td>

                                {/* Net Principal */}
                                <td className="py-3 px-3 text-right font-mono font-medium text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                                  <div>{formatMoney(item.netPrincipal)}</div>
                                  {(() => {
                                    const principalInfo = principals.find((p) => p.rawName === item.rawName);
                                    if (principalInfo && principalInfo.excludedJanuaryWithdraw > 0) {
                                      return (
                                        <span
                                          className="text-[10px] text-amber-600 dark:text-amber-400 block font-normal"
                                          title="该合伙人本年度1月份出金已作为上年分红排除，不扣减本金"
                                        >
                                          已豁免1月出金: ¥{principalInfo.excludedJanuaryWithdraw.toLocaleString('zh-CN')}
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                </td>

                                {/* Share Ratio */}
                                <td className="py-3 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                                  {(item.shareRatio * 100).toFixed(2)}%
                                </td>

                                {/* Gross Profit Share */}
                                <td className="py-3 px-3 text-right font-mono font-medium text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                                  {formatMoney(item.grossProfitShare)}
                                </td>

                                {/* Return Rate (Gross / Net) */}
                                <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                                  <div className="flex flex-col items-end">
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                      毛 +{((item.profitRate || 0) * 100).toFixed(2)}%
                                    </span>
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                                      净 +{((item.netDividendRate || 0) * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                </td>

                                {/* Fee Rate (Pure Display badge based on mechanism & rules) */}
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                  <div className="inline-flex flex-col items-center">
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border select-none ${
                                        item.isReentered
                                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                          : hasExcessProfit
                                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                          : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                      }`}
                                    >
                                      {item.isReentered
                                        ? '50% 惩罚'
                                        : feeMode === 'progressive'
                                        ? `${(item.feeRate * 100).toFixed(1)}% 累进`
                                        : `${Math.round(item.feeRate * 100)}%`}
                                    </span>
                                    {feeMode === 'progressive' && !item.isReentered && (
                                      <span className="text-[10px] text-slate-400 mt-0.5">
                                        {hasExcessProfit ? '超5%部分50%' : '5%以内10%'}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Fee Amount */}
                                <td className="py-3 px-3 text-right font-mono text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                  -{formatMoney(item.feeAmount)}
                                </td>

                                {/* Net Dividend Payout */}
                                <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
                                  +{formatMoney(item.netDividend)}
                                </td>

                                {/* Remaining Principal */}
                                <td className="py-3 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                                  {formatMoney(item.remainingPrincipal)}
                                </td>
                              </tr>

                              {/* Collapsible Detailed Calculation Breakdown Drawer */}
                              {isExpanded && (
                                <tr className="bg-slate-50/80 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800">
                                  <td colSpan={10} className="p-3 sm:p-5 pl-4 sm:pl-10">
                                    <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-white dark:bg-zinc-900/90 p-4 space-y-3.5 shadow-xs">
                                      {/* Header of Drawer */}
                                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2.5">
                                        <div className="flex items-center gap-2">
                                          <span className="p-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-xs">
                                            📐 分红与手续费推导详情
                                          </span>
                                          <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono text-sm">
                                            {meta?.displayName || item.rawName}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedSharePartner(item.rawName);
                                              setIsShareModalOpen(true);
                                            }}
                                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-sans font-medium"
                                          >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>生成专属结算单 (图片/PDF)</span>
                                          </button>
                                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                            {feeMode === 'progressive' ? '超额累进制（5%以内10%，超出50%）' : '指定费率制'}
                                          </span>
                                          {item.isReentered && (
                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-semibold border border-rose-300 dark:border-rose-800">
                                              ⚠️ 触发规则4：当年离场重入 (50%惩罚)
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* 3 Step Calculation Cards Grid */}
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                        {/* Step 1: Principal & Profit Allocation */}
                                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-1.5">
                                          <div className="text-slate-600 dark:text-zinc-300 font-semibold flex items-center gap-1 whitespace-nowrap">
                                            <span className="w-4 h-4 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-[10px] shrink-0">
                                              1
                                            </span>
                                            <span>基础出资与分配毛利</span>
                                          </div>
                                          <div className="space-y-1 text-slate-700 dark:text-zinc-300 font-mono text-[11px]">
                                            <div className="flex justify-between items-center whitespace-nowrap">
                                              <span>累计净出资本金 (成本):</span>
                                              <span className="font-semibold">{formatMoney(item.netPrincipal)}</span>
                                            </div>
                                            <div className="flex justify-between items-center whitespace-nowrap">
                                              <span>在活跃资金池占比:</span>
                                              <span className="font-semibold">{(item.shareRatio * 100).toFixed(2)}%</span>
                                            </div>
                                            <div className="flex justify-between items-center whitespace-nowrap">
                                              <span>分配毛收益 (总利润×占比):</span>
                                              <span className="font-bold text-slate-900 dark:text-zinc-100">
                                                {formatMoney(item.grossProfitShare)}
                                              </span>
                                            </div>
                                            <div className="flex justify-between items-center text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                                              <span>当期毛收益率 (毛利÷本金):</span>
                                              <span className="font-bold">
                                                +{((item.profitRate || 0) * 100).toFixed(2)}%
                                              </span>
                                            </div>
                                            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-200/60 dark:border-zinc-800 whitespace-nowrap">
                                              <span>5% 门槛收益基准线:</span>
                                              <span>
                                                {formatMoney(item.tierDetail?.hurdleProfitThreshold || item.netPrincipal * 0.05)}
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Step 2: Performance Fee Calculation */}
                                        <div className="p-3 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/50 space-y-1.5">
                                          <div className="text-indigo-700 dark:text-indigo-300 font-semibold flex items-center gap-1 whitespace-nowrap">
                                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px] shrink-0">
                                              2
                                            </span>
                                            <span>手续费提成测算</span>
                                          </div>
                                          {item.isReentered ? (
                                            <div className="space-y-1 text-[11px] font-mono text-rose-700 dark:text-rose-400">
                                              <p className="leading-relaxed font-sans">
                                                按规则4：当年曾离场出金并重新入金，不享受累进优惠，全部利润按 50% 扣除手续费：
                                              </p>
                                              <div className="pt-1 font-bold">
                                                ¥{item.grossProfitShare.toFixed(2)} × 50% = -¥{item.feeAmount.toFixed(2)}
                                              </div>
                                            </div>
                                          ) : item.tierDetail ? (
                                            <div className="space-y-1.5 text-slate-700 dark:text-zinc-300 font-mono text-[11px]">
                                              {/* Tier 1 mini card */}
                                              <div className="p-1.5 rounded bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 space-y-0.5">
                                                <div className="flex items-center justify-between font-sans text-emerald-700 dark:text-emerald-400 font-medium text-[11px] whitespace-nowrap">
                                                  <span>阶梯① (≤5% 基准毛利)</span>
                                                  <span className="font-mono">计提 10%</span>
                                                </div>
                                                <div className="flex items-center justify-between font-mono text-xs whitespace-nowrap">
                                                  <span className="text-slate-500">¥{item.tierDetail.tier1Profit.toFixed(2)} × 10%</span>
                                                  <span className="font-bold text-emerald-700 dark:text-emerald-300">= ¥{item.tierDetail.tier1Fee.toFixed(2)}</span>
                                                </div>
                                              </div>

                                              {/* Tier 2 mini card */}
                                              <div className="p-1.5 rounded bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 space-y-0.5">
                                                <div className="flex items-center justify-between font-sans text-amber-700 dark:text-amber-400 font-medium text-[11px] whitespace-nowrap">
                                                  <span>阶梯② (&gt;5% 超额利润)</span>
                                                  <span className="font-mono">计提 50%</span>
                                                </div>
                                                <div className="flex items-center justify-between font-mono text-xs whitespace-nowrap">
                                                  <span className="text-slate-500">
                                                    {item.tierDetail.tier2Profit > 0 ? `¥${item.tierDetail.tier2Profit.toFixed(2)} × 50%` : '未超 5% 门槛'}
                                                  </span>
                                                  <span className="font-bold text-amber-700 dark:text-amber-300">
                                                    = ¥{item.tierDetail.tier2Fee.toFixed(2)}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="flex justify-between items-center text-indigo-700 dark:text-indigo-300 font-semibold pt-1 border-t border-indigo-200/80 dark:border-indigo-900 font-mono text-[11px] whitespace-nowrap">
                                                <span className="font-sans">合计手续费扣除:</span>
                                                <span className="font-bold">
                                                  -¥{item.feeAmount.toFixed(2)} (综合费率 {(item.feeRate * 100).toFixed(1)}%)
                                                </span>
                                              </div>

                                              {/* Visual Tier Proportions Bar */}
                                              {item.grossProfitShare > 0 && (
                                                <div className="pt-1">
                                                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex">
                                                    <div
                                                      style={{
                                                        width: `${Math.min(
                                                          100,
                                                          (item.tierDetail.tier1Profit / item.grossProfitShare) * 100
                                                        )}%`,
                                                      }}
                                                      className="bg-emerald-500 h-full"
                                                      title={`5%以内利润 ¥${item.tierDetail.tier1Profit.toFixed(2)} (按10%计提)`}
                                                    />
                                                    <div
                                                      style={{
                                                        width: `${Math.max(
                                                          0,
                                                          (item.tierDetail.tier2Profit / item.grossProfitShare) * 100
                                                        )}%`,
                                                      }}
                                                      className="bg-amber-500 h-full"
                                                      title={`超出5%超额利润 ¥${item.tierDetail.tier2Profit.toFixed(2)} (按50%计提)`}
                                                    />
                                                  </div>
                                                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 font-sans">
                                                    <span className="text-emerald-600 dark:text-emerald-400">■ 5%以内(10%)</span>
                                                    <span className="text-amber-600 dark:text-amber-400">■ 超出5%(50%)</span>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="text-[11px] font-mono">
                                              毛收益 ¥{item.grossProfitShare.toFixed(2)} × {Math.round(item.feeRate * 100)}% = ¥{item.feeAmount.toFixed(2)}
                                            </div>
                                          )}
                                        </div>

                                        {/* Step 3: Net Dividend and Remaining Principal */}
                                        <div className="p-3 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/50 space-y-1.5">
                                          <div className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 whitespace-nowrap">
                                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[10px] shrink-0">
                                              3
                                            </span>
                                            <span>实发现金分红与留存底仓</span>
                                          </div>
                                          <div className="space-y-1 text-slate-700 dark:text-zinc-300 font-mono text-[11px]">
                                            <div className="flex justify-between items-baseline">
                                              <span>应发现金分红 (实到):</span>
                                              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                +{formatMoney(item.netDividend)}
                                              </span>
                                            </div>
                                            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                                              <span>到手净收益率 (分红÷本金):</span>
                                              <span className="font-bold">
                                                +{((item.netDividendRate || 0) * 100).toFixed(2)}%
                                              </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-sans">
                                              (毛收益 ¥{item.grossProfitShare.toFixed(2)} - 提成 ¥{item.feeAmount.toFixed(2)})
                                            </p>
                                            <div className="flex justify-between pt-1 border-t border-emerald-200/80 dark:border-emerald-900">
                                              <span>分红后留存底仓本金:</span>
                                              <span className="font-bold text-slate-800 dark:text-zinc-200">
                                                {formatMoney(item.remainingPrincipal)}
                                              </span>
                                            </div>
                                            <p className="text-[10px] text-emerald-600/90 dark:text-emerald-400/80 font-sans">
                                              ✅ 原始出资本金完整保留，不因分红而减少底仓
                                            </p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Calculation Summary Footer */}
                                      {item.tierDetail?.calculationSummary && (
                                        <div className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-950 text-slate-600 dark:text-zinc-400 font-mono flex items-center gap-1.5">
                                          <span className="text-slate-400">推导公式:</span>
                                          <span className="text-slate-800 dark:text-zinc-200">{item.tierDetail.calculationSummary}</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </div>
                          );
                        })
                      )}
                    </tbody>

                    {/* Table Totals Footer */}
                    {dividendPlan.items.length > 0 && (
                      <tfoot className="border-t-2 border-slate-300 dark:border-zinc-700 bg-slate-50/90 dark:bg-zinc-900/90 font-mono text-xs font-semibold">
                        <tr>
                          <td className="py-2.5 pl-3 pr-1 text-center"></td>
                          <td className="py-2.5 px-3 text-slate-800 dark:text-zinc-200 font-sans font-bold">
                            合计 ({dividendPlan.items.length} 人)
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-800 dark:text-zinc-200">
                            {formatMoney(dividendPlan.totalPoolPrincipal)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500">
                            100.00%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-800 dark:text-zinc-200 font-bold">
                            {formatMoney(dividendPlan.totalGrossProfit)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                毛 +{((dividendPlan.totalProfitRate || 0) * 100).toFixed(2)}%
                              </span>
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                                净 +{((dividendPlan.totalNetDividendRate || 0) * 100).toFixed(2)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-500">
                            {dividendPlan.totalGrossProfit > 0
                              ? `${((dividendPlan.totalManagerFee / dividendPlan.totalGrossProfit) * 100).toFixed(1)}% 综合`
                              : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-indigo-600 dark:text-indigo-400">
                            -{formatMoney(dividendPlan.totalManagerFee)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                            +{formatMoney(dividendPlan.totalNetDividend)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500">
                            {formatMoney(dividendPlan.totalPoolPrincipal)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Bottom Rule Explanation */}
              <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs text-slate-600 dark:text-zinc-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong>分红运作原则:</strong> 本期分红发放完毕后，合伙人的留存本金维持原始净投入不变。
                  点击“一键生成分红出金流水”后，系统将自动录入对应出金流水并标记为分红，账目透明可审计。
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: New Member Entry Simulation */}
          {activeSubTab === 'new_member' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-emerald-500" />
                      <span>新投资人准入与现有收益均分清算 (规则第2条)</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      "仅在保证盈利之后, 才允许其他人入场, 并且会把现有的收益部分作为分红分给已经在的朋友们, 确保在有新人加入时, 各位的账单可以简单的做一次均分"
                    </p>
                  </div>

                  {newMemberSim.allowed ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 shrink-0">
                      <Check className="w-3.5 h-3.5" /> 满足准入条件
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800 shrink-0">
                      <AlertCircle className="w-3.5 h-3.5" /> 拦截准入 (未盈利)
                    </span>
                  )}
                </div>

                {/* Input form */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                      新合伙人姓名 / 备注名称
                    </label>
                    <input
                      type="text"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      placeholder="如: 赵六 / 朋友小王"
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                      拟入资金额 (¥)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      value={newMemberAmount}
                      onChange={(e) => setNewMemberAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="如: 50000"
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Entry status reasoning */}
                <div
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-3 ${
                    newMemberSim.allowed
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {newMemberSim.allowed ? (
                    <Check className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                  )}
                  <div>
                    <div className="font-semibold mb-1">准入评估结论:</div>
                    <p>{newMemberSim.reason}</p>
                  </div>
                </div>
              </div>

              {/* If allowed: show Step 1 and Step 2 Clean Plan */}
              {newMemberSim.allowed && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Step 1: Pre-entry Profit Distribution */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 inline-flex items-center justify-center text-xs">
                          1
                        </span>
                        <span>第一步：在场合伙人收益先清算分红</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        发还分红 ¥{newMemberSim.totalDividendPaidOut.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      将现有累计盈利 ¥{newMemberSim.currentProfit.toFixed(2)} 分配发还，各老投资人账底归整：
                    </p>

                    <div className="space-y-2">
                      {newMemberSim.existingPartnersDividend.map((p) => (
                        <div
                          key={p.rawName}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-950 text-xs font-mono"
                        >
                          <div>
                            <span className="font-bold text-slate-800 dark:text-zinc-200">
                              {getDisplayName(p.rawName)}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-2">
                              (原出资 ¥{p.netPrincipal.toLocaleString('zh-CN')})
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              +¥{p.netDividend.toFixed(2)} 分红
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              收益率 +{((p.netPrincipal > 0 ? p.netDividend / p.netPrincipal : 0) * 100).toFixed(2)}% | 提成: ¥{p.feeAmount.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Clean Post-entry Capital Distribution */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 inline-flex items-center justify-center text-xs">
                          2
                        </span>
                        <span>第二步：新合伙人注入后全新均等/出资份额</span>
                      </span>
                      <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                        新总规模 ¥{newMemberSim.postEntryPool.totalCapital.toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      老收益发完后，各位账面简单归整，新入金注入后全新出资份额如下：
                    </p>

                    <div className="space-y-2">
                      {newMemberSim.postEntryPool.members.map((m) => (
                        <div
                          key={m.rawName}
                          className={`flex items-center justify-between p-2.5 rounded-lg text-xs font-mono border ${
                            m.isNew
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-zinc-200">
                              {getDisplayName(m.rawName)}
                            </span>
                            {m.isNew && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-600 text-white font-semibold">
                                新入场
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-800 dark:text-zinc-200">
                              ¥{m.capital.toLocaleString('zh-CN')}
                            </span>
                            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold ml-2">
                              占比 {(m.newShareRatio * 100).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Exit & Re-entry Tracker */}
          {activeSubTab === 'exit' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Exit Simulator Form */}
                <div className="lg:col-span-1 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 shadow-2xs">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>投资人离场清算 (规则第4条)</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      "离场时间不限, 但要至少提前3天说明, 离场时会计算手续费, 并且每年会重新计算手续费"
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                      选择离场投资人
                    </label>
                    <select
                      value={exitCounterparty}
                      onChange={(e) => setExitCounterparty(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100"
                    >
                      {principals.map((p) => (
                        <option key={p.rawName} value={p.rawName}>
                          {getDisplayName(p.rawName)} (净本金: ¥{p.netPrincipal.toLocaleString('zh-CN')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="notice-check"
                        checked={exitNoticeConfirmed}
                        onChange={(e) => setExitNoticeConfirmed(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="notice-check" className="text-slate-700 dark:text-zinc-300 font-medium">
                        已提前至少 3 天明确提出离场说明
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-400 pl-5">
                      按合伙约定，未提前3天报备的不予即刻清退，需待3天筹备期满。
                    </p>
                  </div>

                  {(() => {
                    const targetPartner = dividendPlan.items.find((i) => i.rawName === exitCounterparty);
                    if (!targetPartner) return null;

                    const totalPayable = targetPartner.netPrincipal + Math.max(0, targetPartner.netDividend);

                    return (
                      <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 space-y-2 text-xs font-mono">
                        <span className="font-bold text-rose-800 dark:text-rose-300 text-sm block">
                          离场应退清算总金额:
                        </span>
                        <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                          {formatMoney(totalPayable)}
                        </div>
                        <div className="border-t border-rose-200/80 dark:border-rose-900/60 pt-2 text-[11px] text-slate-600 dark:text-zinc-400 space-y-1">
                          <div className="flex justify-between">
                            <span>退还留存本金 (出资本金成本):</span>
                            <span className="font-semibold">{formatMoney(targetPartner.netPrincipal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>当期分红 (+收益 -提成):</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              +{formatMoney(targetPartner.netDividend)}
                              <span className="text-[11px] font-normal ml-1">
                                (净收益率 +{((targetPartner.netDividendRate || 0) * 100).toFixed(2)}%)
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Re-entry 50% Tracker Panel */}
                <div className="lg:col-span-2 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-2.5">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-500" />
                        <span>当年离场后重新加入追踪 (50% 手续费惩罚条款)</span>
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        "避免手续费计算麻烦, 如果离场之后又重新加入, 当年随后的盈利部分全部收取 50%的手续费."
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/50 text-slate-500 dark:text-zinc-400 font-semibold">
                          <th className="py-2.5 px-3">合伙人</th>
                          <th className="py-2.5 px-3">本年进出状态</th>
                          <th className="py-2.5 px-3">自动识别原因</th>
                          <th className="py-2.5 px-3 text-center">适用提成费率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                        {principals.map((p) => (
                          <tr key={p.rawName} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/30">
                            <td className="py-3 px-3 font-semibold text-slate-800 dark:text-zinc-200 font-mono whitespace-nowrap">
                              {getDisplayName(p.rawName)}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {p.hasReenteredInYear ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800">
                                  ⚠️ 触发再入场条款
                                </span>
                              ) : (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                                  正常持资
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-500 dark:text-zinc-400 max-w-xs truncate text-[11px]">
                              {p.reentryReason || '本自然年内无出金后再入金记录'}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                                  p.hasReenteredInYear
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                                }`}
                              >
                                {p.hasReenteredInYear ? '50%' : '10%'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Position Distribution & 3-Day Notice Report */}
          {activeSubTab === 'position' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <PieIcon className="w-4 h-4 text-purple-500" />
                      <span>当前持仓分布与信息披露报告 (规则第3条)</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      "我会不定期同步仓位, 同时在有人要求出具仓位的时候, 我会在3天之内制作当前位置的仓位分布情况, 附在表格中, 并且确保通知到位"
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const list = holdings.map((h) => ({
                        code: h.stock_code,
                        name: h.stock_name,
                        totalValue: h.total_value,
                        weight: holdingsTotalValue > 0 ? (h.total_value / holdingsTotalValue) * 100 : 0,
                        profitLoss: h.profit_loss,
                      }));
                      const text = generatePositionNoticeText({
                        accountAlias,
                        date: new Date().toISOString().split('T')[0],
                        totalAsset: holdingsTotalValue,
                        positionRatio: holdingsTotalValue > 0 ? 80 : 0,
                        holdings: list,
                      });
                      handleCopyText(text, 'position-notice');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-2xs shrink-0 self-start sm:self-center"
                  >
                    {copiedKey === 'position-notice' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>复制规范持仓披露通知 (发群)</span>
                  </button>
                </div>

                {/* Position Summary Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                    <span className="text-xs text-slate-500 dark:text-zinc-400">持仓总市值</span>
                    <div className="text-lg font-bold font-mono text-slate-900 dark:text-zinc-100 mt-0.5">
                      {formatMoney(holdingsTotalValue)}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                    <span className="text-xs text-slate-500 dark:text-zinc-400">当前持股/标的数</span>
                    <div className="text-lg font-bold font-mono text-slate-900 dark:text-zinc-100 mt-0.5">
                      {holdings.length} 只标的
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 col-span-2 sm:col-span-1">
                    <span className="text-xs text-slate-500 dark:text-zinc-400">履约时效承诺</span>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ✅ 3天内出具并通知到位
                    </div>
                  </div>
                </div>

                {/* Holdings Table */}
                <div className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 text-slate-500 dark:text-zinc-400 font-semibold whitespace-nowrap">
                        <th className="py-2.5 px-3">代码 / 名称</th>
                        <th className="py-2.5 px-3 text-right">持仓数量</th>
                        <th className="py-2.5 px-3 text-right">最新市值</th>
                        <th className="py-2.5 px-3 text-right">持仓占比</th>
                        <th className="py-2.5 px-3 text-right">浮动盈亏</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                      {holdings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            当前账户暂无实时股票持仓，或全部为现金与流动资金储备
                          </td>
                        </tr>
                      ) : (
                        holdings.map((h) => {
                          const weight =
                            holdingsTotalValue > 0 ? (h.total_value / holdingsTotalValue) * 100 : 0;
                          const isProfit = h.profit_loss >= 0;

                          return (
                            <tr key={h.stock_code} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30">
                              <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                                <span className="font-mono text-slate-900 dark:text-zinc-100">{h.stock_name}</span>
                                <span className="text-[11px] text-slate-400 block font-mono">{h.stock_code}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-zinc-300">
                                {h.quantity.toLocaleString('zh-CN')}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 dark:text-zinc-200">
                                {formatMoney(h.total_value)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                                {weight.toFixed(2)}%
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap ${
                                  isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {isProfit ? '+' : ''}
                                {formatMoney(h.profit_loss)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: The 5 Investment Charter Rules */}
          {activeSubTab === 'rules' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Rule 1 */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center">
                      1
                    </span>
                    <h5 className="font-bold text-slate-900 dark:text-zinc-100 text-sm">零管理费 · 超额累进提成承诺</h5>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-400 leading-relaxed pl-8">
                    我不收固定管理费（0%），仅对真实实现的盈利部分提取业绩手续费。默认执行超额累进制：每位出资人收益率 5% 以内部份按 10% 计提，超出 5% 的超额收益部份按 50% 计提。亏损或保本期间，管理人不产生任何收费。
                  </p>
                </div>

                {/* Rule 2 */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center">
                      2
                    </span>
                    <h5 className="font-bold text-slate-900 dark:text-zinc-100 text-sm">盈利均分准入规则</h5>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-400 leading-relaxed pl-8">
                    仅在保证盈利的前提下才允许新人入场。入场前，现有收益会先作为分红结算并发给已在的朋友们，将底仓归整，确保新人入场后大家的账单可以简单、公允地做一次均分。
                  </p>
                </div>

                {/* Rule 3 */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 font-bold flex items-center justify-center">
                      3
                    </span>
                    <h5 className="font-bold text-slate-900 dark:text-zinc-100 text-sm">3日仓位同步与通知</h5>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-400 leading-relaxed pl-8">
                    不定期向大家同步仓位。在任何人要求出具仓位时，我会在 3 天之内制作当前位置的仓位分布与资产运作情况，附在表格中并确保通知到位。
                  </p>
                </div>

                {/* Rule 4 */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 font-bold flex items-center justify-center">
                      4
                    </span>
                    <h5 className="font-bold text-slate-900 dark:text-zinc-100 text-sm">提前3天离场 & 再入场50%手续费</h5>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-400 leading-relaxed pl-8">
                    离场时间不限，但需至少提前 3 天说明。离场时结算手续费，每年重新核算。为避免频繁进出造成手续费核算复杂，如果离场之后当年又重新加入，当年随后的盈利部分全部收取 50% 手续费。
                  </p>
                </div>

                {/* Rule 5 */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1.5 shadow-2xs md:col-span-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center">
                      5
                    </span>
                    <h5 className="font-bold text-slate-900 dark:text-zinc-100 text-sm">自然年元旦后强制分红结算</h5>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-400 leading-relaxed pl-8">
                    每年的收益计算基准为元旦之后的第一个交易日。如果当年为亏损或无超额收益状态，则不进行分红计提；如果处于盈利状态，则强制进行收益结算并向合伙人发放分红。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dividend Share / Screenshot Modal */}
      <CashFlowDividendShareModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          setSelectedSharePartner(undefined);
        }}
        theme={theme}
        accountAlias={accountAlias}
        plan={dividendPlan}
        settleDate={settleDate}
        allCounterparties={allCounterparties}
        initialMasked={isMasked}
        isFlowsRecorded={isFlowsRecorded}
        initialPartnerRawName={selectedSharePartner}
        initialViewMode={selectedSharePartner ? 'single' : 'all'}
      />
    </div>
  );
}
