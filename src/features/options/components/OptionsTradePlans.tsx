import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Target, FileText, Calendar, RefreshCw, X } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { optionsService, stockService } from '../../../lib/services';
import type { RatioSpreadPlanResult } from '../../../lib/services/types';

interface OptionsTradePlansProps {
  theme: Theme;
  selectedSymbol: string;
  selectedAccountId?: string | null;
  userId?: string | null;
}

export function OptionsTradePlans({ theme, selectedSymbol, selectedAccountId: selectedAccountIdProp, userId }: OptionsTradePlansProps) {
  const { currencyConfig } = useCurrency();
  const [symbol, setSymbol] = useState<string>(selectedSymbol);
  const [ratioPlans, setRatioPlans] = useState<RatioSpreadPlanResult[]>([]);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [isLoadingRatio, setIsLoadingRatio] = useState(false);
  const [ratioError, setRatioError] = useState<string | null>(null);
  const [underlyingPrice, setUnderlyingPrice] = useState<number | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [atmFilter, setAtmFilter] = useState<'all' | 'itm' | 'atm' | 'otm'>('all');
  const [optionTypeFilter, setOptionTypeFilter] = useState<'all' | 'call' | 'put'>('all');
  const [savedFilter, setSavedFilter] = useState<'all' | 'saved' | 'unsaved'>('all');
  const [sortKey, setSortKey] = useState<'leverage' | 'net' | 'buy' | 'sell'>('buy');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    const cookie = typeof document !== 'undefined' ? (document.cookie ? (document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('selectedAccountId='))?.split('=')[1] ?? null) : null) : null;
    return selectedAccountIdProp ?? cookie ?? null;
  });
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editedConfig, setEditedConfig] = useState<{
    expiry: string;
    option_type: 'call' | 'put';
    lower_strike: number;
    upper_strike: number;
    target_spread: number;
    cover_contracts_needed: number;
    label: string;
  } | null>(null);
  const openEditModal = (rp: RatioSpreadPlanResult) => {
    setEditingPlanId(`${rp.plan.label}-${rp.plan.expiry}`);
    setEditedConfig({
      expiry: rp.plan.expiry,
      option_type: rp.plan.option_type,
      lower_strike: rp.plan.lower_strike,
      upper_strike: rp.plan.upper_strike,
      target_spread: rp.plan.target_spread,
      cover_contracts_needed: rp.plan.cover_contracts_needed,
      label: rp.plan.label,
    });
  };
  const closeEditModal = () => {
    setEditingPlanId(null);
    setEditedConfig(null);
  };
  const submitEdit = async () => {
    if (!editingPlanId || !editedConfig) return;
    const existing = ratioPlans.find(p => `${p.plan.label}-${p.plan.expiry}` === editingPlanId);
    if (!existing) { closeEditModal(); return; }
    const updated: RatioSpreadPlanResult = {
      ...existing,
      plan: { ...editedConfig },
    };
    try {
      const { data } = await optionsService.refreshRatioSpreadPlan(updated, selectedAccountId, userId ?? null);
      const next = data || updated;
      setRatioPlans(prev => prev.map(p => `${p.plan.label}-${p.plan.expiry}` === editingPlanId ? next : p));
    } finally {
      closeEditModal();
    }
  };
  const groupedByExpiry: Record<string, RatioSpreadPlanResult[]> = ratioPlans.reduce((acc, rp) => {
    const key = rp.plan.expiry;
    if (!acc[key]) acc[key] = [];
    acc[key].push(rp);
    return acc;
  }, {} as Record<string, RatioSpreadPlanResult[]>);
  const sortedExpiries = Object.keys(groupedByExpiry).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const getMoneyness = (rp: RatioSpreadPlanResult): 'itm' | 'atm' | 'otm' => {
    // Explicitly check for analysis to prevent "Cannot read properties of null" error
    const strike = (rp.analysis && rp.analysis.buy_strike_price != null) ? rp.analysis.buy_strike_price : null;
    const type = rp.plan.option_type;
    const threshold = 0.005;
    if (strike == null) return 'otm';
    if (underlyingPrice != null) {
      const diffRatio = Math.abs(underlyingPrice - strike) / Math.max(strike, 1);
      if (diffRatio <= threshold) return 'atm';
      if (type === 'call') return underlyingPrice > strike ? 'itm' : 'otm';
      return underlyingPrice < strike ? 'itm' : 'otm';
    }
    const mid = (rp.plan.lower_strike + rp.plan.upper_strike) / 2;
    const diffRatio = Math.abs(mid - strike) / Math.max(strike, 1);
    if (diffRatio <= threshold) return 'atm';
    if (type === 'call') return mid > strike ? 'itm' : 'otm';
    return mid < strike ? 'itm' : 'otm';
  };

  const getPlanColor = (rp: RatioSpreadPlanResult) => {
    const m = getMoneyness(rp);
    if (m === 'atm') return theme === 'dark' ? 'border-blue-400 bg-blue-900/30' : 'border-blue-300 bg-blue-50';
    if (m === 'itm') return theme === 'dark' ? 'border-green-400 bg-green-900/30' : 'border-green-300 bg-green-50';
    return theme === 'dark' ? 'border-amber-400 bg-amber-900/30' : 'border-amber-300 bg-amber-50';
  };

  const filterPlan = (rp: RatioSpreadPlanResult) => {
    if (savedFilter === 'saved' && !rp.saved) return false;
    if (savedFilter === 'unsaved' && rp.saved) return false;
    if (optionTypeFilter !== 'all' && rp.plan.option_type !== optionTypeFilter) return false;
    if (atmFilter !== 'all') {
      if (getMoneyness(rp) !== atmFilter) return false;
    }
    return true;
  };

  const sortPlans = (a: RatioSpreadPlanResult, b: RatioSpreadPlanResult) => {
    switch (sortKey) {
      case 'leverage':
        return (b.leverage ?? 0) - (a.leverage ?? 0);
      case 'net':
        return (b.best_net_premium ?? 0) - (a.best_net_premium ?? 0);
      case 'buy':
        return (b.buy_price ?? 0) - (a.buy_price ?? 0);
      case 'sell':
        return (b.sell_price ?? 0) - (a.sell_price ?? 0);
      default:
        return 0;
    }
  };

  const refreshRatioPlans = async () => {
    if (!symbol) {
      setRatioPlans([]);
      setRatioError(null);
      return;
    }
    try {
      setIsLoadingRatio(true);
      setRatioError(null);
      const { data, error } = await optionsService.getRatioSpreadPlans(symbol, selectedAccountId, userId ?? null);
      if (error) throw error;
      setRatioPlans(data || []);
    } catch (e: unknown) {
      setRatioError(e instanceof Error ? e.message : '获取比率价差计划失败');
      setRatioPlans([]);
    } finally {
      setIsLoadingRatio(false);
    }
  };

  const handleSavePlan = async (rp: RatioSpreadPlanResult) => {
    const id = `${rp.plan.label}-${rp.plan.expiry}`;
    setSavingIds(prev => ({ ...prev, [id]: true }));
    try {
      const { data, error } = await optionsService.saveRatioSpreadPlan(rp, selectedAccountId, userId ?? null);
      if (error) throw error;
      if (data) {
        setRatioPlans(prev => prev.map(p => {
          const pid = `${p.plan.label}-${p.plan.expiry}`;
          return pid === id ? { ...p, saved: true } : p;
        }));
      }
    } catch (e) {
      console.error('save ratio plan failed', e);
    } finally {
      setSavingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleRefreshSavedPlan = async (rp: RatioSpreadPlanResult) => {
    const id = `${rp.plan.label}-${rp.plan.expiry}`;
    setSavingIds(prev => ({ ...prev, [id]: true }));
    try {
      const { data, error } = await optionsService.refreshRatioSpreadPlan(rp, selectedAccountId, userId ?? null);
      if (error) throw error;
      if (data) {
        setRatioPlans(prev => prev.map(p => {
          const pid = `${p.plan.label}-${p.plan.expiry}`;
          return pid === id ? { ...p, ...data, saved: true } : p;
        }));
      }
    } catch (e) {
      console.error('refresh ratio plan failed', e);
    } finally {
      setSavingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  useEffect(() => {
    const fetchRatioPlans = async () => {
      if (!symbol) {
        setRatioPlans([]);
        setRatioError(null);
        return;
      }
      try {
        setIsLoadingRatio(true);
        setRatioError(null);
        const { data, error } = await optionsService.getRatioSpreadPlans(symbol, selectedAccountId, userId ?? null);
        if (error) throw error;
        setRatioPlans(data || []);
      } catch (e: unknown) {
        setRatioError(e instanceof Error ? e.message : '获取比率价差计划失败');
        setRatioPlans([]);
      } finally {
        setIsLoadingRatio(false);
      }
    };
    fetchRatioPlans();
  }, [symbol, selectedAccountId, userId]);

  useEffect(() => {
    const fetchUnderlying = async () => {
      if (!symbol) {
        setUnderlyingPrice(null);
        return;
      }
      try {
        const { data } = await stockService.getCurrentPrice(symbol);
        setUnderlyingPrice(data?.price ?? null);
      } catch {
        setUnderlyingPrice(null);
      }
    };
    fetchUnderlying();
  }, [symbol]);

  useEffect(() => {
    let active = true;
    const fetchSymbols = async () => {
      try {
        setIsLoadingSymbols(true);
        const { data } = await optionsService.getAvailableSymbols();
        if (active) {
          const list = Array.isArray(data) ? data : [];
          setAvailableSymbols(list);
        }
      } finally {
        if (active) setIsLoadingSymbols(false);
      }
    };
    fetchSymbols();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelectedAccountId(selectedAccountIdProp ?? null);
  }, [selectedAccountIdProp]);

  useEffect(() => {
    if (availableSymbols.length > 0) {
      setSymbol(prev => prev || availableSymbols[0]);
    }
  }, [availableSymbols]);

  

  const getStatusColor = (status: OptionsTradePlan['status']) => {
    switch (status) {
      case 'pending':
        return theme === 'dark' 
          ? 'bg-yellow-900 text-yellow-100' 
          : 'bg-yellow-100 text-yellow-800';
      case 'active':
        return theme === 'dark' 
          ? 'bg-blue-900 text-blue-100' 
          : 'bg-blue-100 text-blue-800';
      case 'completed':
        return theme === 'dark' 
          ? 'bg-green-900 text-green-100' 
          : 'bg-green-100 text-green-800';
      case 'cancelled':
        return theme === 'dark'
          ? 'bg-red-900 text-red-100'
          : 'bg-red-100 text-red-800';
      default:
        return theme === 'dark'
          ? 'bg-gray-700 text-gray-100'
          : 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: OptionsTradePlan['type']) => {
    switch (type) {
      case 'call':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'put':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'spread':
        return <Target className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <>
    <div className="space-y-6">
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-purple-500" />
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>比率价差计划</h2>
            <div className="ml-auto flex items-center gap-2">
              <label className={`text-sm ${themes[theme].text}`}>标的</label>
              {availableSymbols.length > 0 ? (
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                  disabled={isLoadingSymbols}
                >
                  <option value="">请选择标的</option>
                  {availableSymbols.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.trim())}
                  className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                  placeholder="例如: SPY"
                />
              )}
              <button
                type="button"
                onClick={refreshRatioPlans}
                disabled={isLoadingRatio || !symbol}
                className={`inline-flex items-center px-2 py-1 rounded ${themes[theme].secondary}`}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </button>
            </div>
          </div>
        </div>
        <div className="p-6">
          {isLoadingRatio && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>加载中...</p>
            </div>
          )}
          {!isLoadingRatio && ratioError && (
            <div className={`rounded-lg p-4 border ${themes[theme].border}`}>
              <p className={`text-sm ${themes[theme].text}`}>{ratioError}</p>
            </div>
          )}
          {!isLoadingRatio && !ratioError && ratioPlans.length > 0 && (
            <div className="space-y-6">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>类型</span>
                  <select value={optionTypeFilter} onChange={(e) => setOptionTypeFilter(e.target.value as typeof optionTypeFilter)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="all">全部</option>
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>价内/平值/价外</span>
                  <select value={atmFilter} onChange={(e) => setAtmFilter(e.target.value as typeof atmFilter)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="all">全部</option>
                    <option value="itm">仅ITM</option>
                    <option value="atm">仅ATM</option>
                    <option value="otm">仅OTM</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>保存</span>
                  <select value={savedFilter} onChange={(e) => setSavedFilter(e.target.value as typeof savedFilter)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="all">全部</option>
                    <option value="saved">已保存</option>
                    <option value="unsaved">未保存</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${themes[theme].text}`}>排序</span>
                  <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className={`px-2 py-1 rounded text-sm ${themes[theme].input} ${themes[theme].text}`}>
                    <option value="leverage">杠杆</option>
                    <option value="net">净权利金</option>
                    <option value="buy">买价</option>
                    <option value="sell">卖价</option>
                  </select>
                </div>
                {underlyingPrice != null && (
                  <div className={`ml-auto text-sm ${themes[theme].text}`}>标的价 {underlyingPrice}</div>
                )}
              </div>
              <div className="flex gap-2 sm:hidden">
                <button
                  onClick={() => setOptionTypeFilter(prev => prev === 'all' ? 'call' : prev === 'call' ? 'put' : 'all')}
                  className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                >类型: {optionTypeFilter.toUpperCase()}</button>
                <button
                  onClick={() => setAtmFilter(prev => prev === 'all' ? 'atm' : prev === 'atm' ? 'itm' : prev === 'itm' ? 'otm' : 'all')}
                  className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                >价位: {atmFilter.toUpperCase()}</button>
                <button
                  onClick={() => setSavedFilter(prev => prev === 'all' ? 'saved' : prev === 'saved' ? 'unsaved' : 'all')}
                  className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                >保存: {savedFilter}</button>
              </div>
              {sortedExpiries.map((exp) => (
                <div key={`exp-${exp}`} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className={`text-sm font-semibold ${themes[theme].text}`}>
                      到期 {new Date(exp).toLocaleDateString()} · {groupedByExpiry[exp].length} 条计划
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <span className={`text-sm font-medium ${themes[theme].text}`}>Call ({groupedByExpiry[exp].filter(p => p.plan.option_type === 'call').length})</span>
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        {groupedByExpiry[exp]
                          .filter((rp) => rp.plan.option_type === 'call')
                          .filter(filterPlan)
                          .sort(sortPlans)
                          .map((rp, idx) => (
                          <div key={`ratio-call-${exp}-${idx}`} className={`${themes[theme].background} rounded-lg p-2 sm:p-3 border ${themes[theme].border} relative group ${getPlanColor(rp)} ${rp.action === 'hold' ? 'border-2 border-purple-400 bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-300' : ''}`}>
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                              <div className="flex items-start gap-3">
                                <Target className="w-4 h-4 text-purple-500" />
                                <div className="min-w-0">
                                  <h3 className={`text-sm font-semibold ${themes[theme].text} truncate`}>{rp.plan.label}</h3>
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rp.action === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : rp.action === 'close' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'}`}>{rp.action}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(() => { const m = getMoneyness(rp); return m === 'atm' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' : m === 'itm' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'; })()}`}>{(() => { const m = getMoneyness(rp); return m.toUpperCase(); })()}</span>
                                  </div>
                                  <div className="mt-2 sm:hidden flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                      <span className={`text-xs ${themes[theme].text} opacity-75`}>净权利金</span>
                                      <span className={`px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.best_net_premium, currencyConfig, 4)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className={`text-xs ${themes[theme].text} opacity-75`}>{rp.action === 'hold' ? '当前价差' : '杠杆'}</span>
                                      <span className={`px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>
                                        {rp.action === 'hold' ? formatCurrency(rp.current_spread, currencyConfig, 4) : rp.leverage}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="hidden sm:block text-right">
                                <p className={`text-xs ${themes[theme].text} opacity-75`}>{rp.action === 'hold' ? '当前价差' : '杠杆'}</p>
                                <p className={`text-sm font-semibold ${themes[theme].text}`}>
                                  {rp.action === 'hold' ? formatCurrency(rp.current_spread, currencyConfig, 4) : rp.leverage}
                                </p>
                              </div>
                              <div className="w-full sm:w-auto mt-1 sm:mt-0 flex flex-wrap items-center gap-2 sm:ml-2">
                                <button
                                  onClick={() => handleSavePlan(rp)}
                                  disabled={savingIds[`${rp.plan.label}-${rp.plan.expiry}`] || rp.saved}
                                  className={`px-2 py-1 rounded text-xs ${rp.saved ? 'bg-green-600 text-white' : themes[theme].primary}`}
                                >
                                  {rp.saved ? '已保存' : (savingIds[`${rp.plan.label}-${rp.plan.expiry}`] ? '保存中...' : '保存计划')}
                                </button>
                                <button
                                  onClick={() => openEditModal(rp)}
                                  className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                >
                                  编辑
                                </button>
                                <button
                                  onClick={() => setExpandedPlanId(prev => prev === `${rp.plan.label}-${rp.plan.expiry}` ? null : `${rp.plan.label}-${rp.plan.expiry}`)}
                                  className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                >
                                  详情
                                </button>
                                {rp.saved && (
                                  <button
                                    onClick={() => handleRefreshSavedPlan(rp)}
                                    disabled={savingIds[`${rp.plan.label}-${rp.plan.expiry}`]}
                                    className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                  >
                                    刷新
                                  </button>
                                )}
                              </div>
                            </div>
                            <div
                              className={`${themes[theme].card} rounded-lg border ${themes[theme].border} transition-all duration-300 ease-out overflow-hidden ${expandedPlanId === `${rp.plan.label}-${rp.plan.expiry}` ? 'mt-2 p-3 max-h-[22rem] opacity-100' : 'mt-0 p-0 max-h-0 opacity-0'}`}
                              aria-hidden={expandedPlanId !== `${rp.plan.label}-${rp.plan.expiry}`}
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis?.buy_strike?.name || '-'}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis?.buy_strike?.code || '-'}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis?.sell_strike?.name || '-'}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis?.sell_strike?.code || '-'}</p>
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入价格</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.buy_price, currencyConfig, 4)}</span>
                                </div>
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出价格</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.sell_price, currencyConfig, 4)}</span>
                                </div>
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>净权利金</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.best_net_premium, currencyConfig, 4)}</span>
                                </div>
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>{rp.action === 'hold' ? '当前价差' : '杠杆'}</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>
                                    {rp.action === 'hold' ? formatCurrency(rp.current_spread, currencyConfig, 4) : rp.leverage}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">买入 {rp.analysis?.buy_count || 0}</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">卖出 {rp.analysis?.sell_count || 0}</span>
                                {rp.action === 'hold' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">持仓数目 {Number(rp.current_spread ?? 0).toFixed(4)}</span>
                                )}
                              </div>
                              <div className={`mt-3 ${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                                <p className={`text-sm ${themes[theme].text}`}>{rp.reason}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-red-500" />
                        <span className={`text-sm font-medium ${themes[theme].text}`}>Put ({groupedByExpiry[exp].filter(p => p.plan.option_type === 'put').length})</span>
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        {groupedByExpiry[exp]
                          .filter((rp) => rp.plan.option_type === 'put')
                          .filter(filterPlan)
                          .sort(sortPlans)
                          .map((rp, idx) => (
                          <div key={`ratio-put-${exp}-${idx}`} className={`${themes[theme].background} rounded-lg p-2 sm:p-3 border ${themes[theme].border} relative group ${getPlanColor(rp)} ${rp.action === 'hold' ? 'border-2 border-purple-400 bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-300' : ''}`}>
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                              <div className="flex items-start gap-3">
                                <Target className="w-4 h-4 text-purple-500" />
                                <div className="min-w-0">
                                  <h3 className={`text-sm font-semibold ${themes[theme].text} truncate`}>{rp.plan.label}</h3>
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rp.action === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : rp.action === 'close' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'}`}>{rp.action}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(() => { const m = getMoneyness(rp); return m === 'atm' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100' : m === 'itm' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'; })()}`}>{(() => { const m = getMoneyness(rp); return m.toUpperCase(); })()}</span>
                                  </div>
                                  <div className="mt-2 sm:hidden flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                      <span className={`text-xs ${themes[theme].text} opacity-75`}>净权利金</span>
                                      <span className={`px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.best_net_premium, currencyConfig, 4)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className={`text-xs ${themes[theme].text} opacity-75`}>{rp.action === 'hold' ? '当前价差' : '杠杆'}</span>
                                      <span className={`px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>
                                        {rp.action === 'hold' ? formatCurrency(rp.current_spread, currencyConfig, 4) : rp.leverage}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="hidden sm:block text-right">
                                <p className={`text-xs ${themes[theme].text} opacity-75`}>杠杆</p>
                                <p className={`text-sm font-semibold ${themes[theme].text}`}>{rp.leverage}</p>
                              </div>
                              <div className="w-full sm:w-auto mt-1 sm:mt-0 flex flex-wrap items-center gap-2 sm:ml-2">
                                <button
                                  onClick={() => handleSavePlan(rp)}
                                  disabled={savingIds[`${rp.plan.label}-${rp.plan.expiry}`] || rp.saved}
                                  className={`px-2 py-1 rounded text-xs ${rp.saved ? 'bg-green-600 text-white' : themes[theme].primary}`}
                                >
                                  {rp.saved ? '已保存' : (savingIds[`${rp.plan.label}-${rp.plan.expiry}`] ? '保存中...' : '保存计划')}
                                </button>
                                <button
                                  onClick={() => openEditModal(rp)}
                                  className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                >
                                  编辑
                                </button>
                                <button
                                  onClick={() => setExpandedPlanId(prev => prev === `${rp.plan.label}-${rp.plan.expiry}` ? null : `${rp.plan.label}-${rp.plan.expiry}`)}
                                  className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                >
                                  详情
                                </button>
                                {rp.saved && (
                                  <button
                                    onClick={() => handleRefreshSavedPlan(rp)}
                                    disabled={savingIds[`${rp.plan.label}-${rp.plan.expiry}`]}
                                    className={`px-2 py-1 rounded text-xs ${themes[theme].secondary}`}
                                  >
                                    刷新
                                  </button>
                                )}
                              </div>
                            </div>
                            <div
                              className={`${themes[theme].card} rounded-lg border ${themes[theme].border} transition-all duration-300 ease-out overflow-hidden ${expandedPlanId === `${rp.plan.label}-${rp.plan.expiry}` ? 'mt-2 p-3 max-h-[22rem] opacity-100' : 'mt-0 p-0 max-h-0 opacity-0'}`}
                              aria-hidden={expandedPlanId !== `${rp.plan.label}-${rp.plan.expiry}`}
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis?.buy_strike?.name || '-'}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis?.buy_strike?.code || '-'}</p>
                                </div>
                                <div>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出腿</p>
                                  <p className={`text-sm font-medium ${themes[theme].text}`}>{rp.analysis?.sell_strike?.name || '-'}</p>
                                  <p className={`text-xs ${themes[theme].text} opacity-60`}>代码 {rp.analysis?.sell_strike?.code || '-'}</p>
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>买入价格</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.buy_price, currencyConfig, 4)}</span>
                                </div>
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>卖出价格</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.sell_price, currencyConfig, 4)}</span>
                                </div>
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>净权利金</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>{formatCurrency(rp.best_net_premium, currencyConfig, 4)}</span>
                                </div>
                                <div className={`p-2 rounded border ${themes[theme].border}`}>
                                  <p className={`text-xs ${themes[theme].text} opacity-75`}>{rp.action === 'hold' ? '当前价差' : '杠杆'}</p>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100`}>
                                    {rp.action === 'hold' ? formatCurrency(rp.current_spread, currencyConfig, 4) : rp.leverage}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">买入 {rp.analysis?.buy_count || 0}</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">卖出 {rp.analysis?.sell_count || 0}</span>
                                {rp.action === 'hold' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">持仓数目 {Number(rp.current_spread ?? 0).toFixed(4)}</span>
                                )}
                              </div>
                              <div className={`mt-3 ${themes[theme].card} rounded p-3 border ${themes[theme].border}`}>
                                <p className={`text-sm ${themes[theme].text}`}>{rp.reason}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoadingRatio && !ratioError && ratioPlans.length === 0 && (
            <div className="text-center py-12">
              <FileText className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-40`} />
              <p className={`text-lg font-medium ${themes[theme].text}`}>暂无比率价差计划</p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>请调整参数或稍后重试</p>
            </div>
          )}
        </div>
      </div>
    </div>
    {editingPlanId && editedConfig && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className={`${themes[theme].card} rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
          <div className="sticky top-0 bg-inherit border-b border-gray-200 p-4 flex justify-between items-center">
            <div>
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>编辑计划</h2>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>{editingPlanId}</p>
            </div>
            <button onClick={closeEditModal} className={`p-2 rounded-md ${themes[theme].secondary}`}><X className="w-5 h-5" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>标签</label>
              <input type="text" value={editedConfig.label} onChange={(e) => setEditedConfig(prev => prev ? { ...prev, label: e.target.value } : prev)} className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>到期日</label>
                <input type="date" value={editedConfig.expiry.split('T')[0] || ''} onChange={(e) => setEditedConfig(prev => prev ? { ...prev, expiry: e.target.value } : prev)} className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`} />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>类型</label>
                <select value={editedConfig.option_type} onChange={(e) => setEditedConfig(prev => prev ? { ...prev, option_type: e.target.value as 'call' | 'put' } : prev)} className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`}>
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>下限行权价</label>
                <input type="number" value={editedConfig.lower_strike} onChange={(e) => setEditedConfig(prev => prev ? { ...prev, lower_strike: parseFloat(e.target.value) || 0 } : prev)} className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`} />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>上限行权价</label>
                <input type="number" value={editedConfig.upper_strike} onChange={(e) => setEditedConfig(prev => prev ? { ...prev, upper_strike: parseFloat(e.target.value) || 0 } : prev)} className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`} />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>目标价差</label>
                <input type="number" value={editedConfig.target_spread} onChange={(e) => setEditedConfig(prev => prev ? { ...prev, target_spread: parseFloat(e.target.value) || 0 } : prev)} className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`} />
              </div>
              <div>
                <label className={`block text-sm font-medium ${themes[theme].text} mb-1`}>备兑合约数</label>
                <input type="number" value={editedConfig.cover_contracts_needed} onChange={(e) => setEditedConfig(prev => prev ? { ...prev, cover_contracts_needed: parseInt(e.target.value) || 0 } : prev)} className={`w-full px-3 py-2 rounded-md ${themes[theme].input} ${themes[theme].text}`} />
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={closeEditModal} className={`px-3 py-2 rounded-md ${themes[theme].secondary}`}>取消</button>
            <button onClick={submitEdit} className={`px-3 py-2 rounded-md ${themes[theme].primary}`}>保存</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
