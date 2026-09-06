import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Banknote,
  RefreshCw,
  Plus,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Edit2,
  Trash2,
  Copy,
  Check,
  Calendar,
  AlertCircle,
  Eye,
  EyeOff,
  X,
  Tag
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Theme, themes } from '../../../lib/theme';
import { cashFlowService } from '../../../lib/services';
import type { CashFlowItem } from '../../../lib/services/types';
import { CashFlowModal } from './CashFlowModal';
import {
  CashFlowCounterpartyCharts,
  getCounterpartyMeta,
  extractAllCounterparties
} from './CashFlowCounterpartyCharts';
import { CashFlowDividendView } from './CashFlowDividendView';

interface CashFlowsViewProps {
  theme: Theme;
  accountAlias?: string | null;
  refreshKey?: number;
}

export function CashFlowsView({ theme, accountAlias, refreshKey }: CashFlowsViewProps) {
  const [items, setItems] = useState<CashFlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Privacy masking state for screenshots (default true to protect sensitive names)
  const [isMasked, setIsMasked] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deposit' | 'withdraw' | 'other'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCounterpartyTags, setSelectedCounterpartyTags] = useState<string[]>([]);
  const [keywordTags, setKeywordTags] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CashFlowItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<CashFlowItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inFlightRef = useRef(false);

  const fetchCashFlows = useCallback(async () => {
    if (!accountAlias) {
      setItems([]);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await cashFlowService.getCashFlows(accountAlias);
      if (error) throw error;
      setItems(data?.items || []);
    } catch (err: any) {
      console.error('Error fetching cash flows:', err);
      setError(err?.message || '获取现金流水失败');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [accountAlias]);

  useEffect(() => {
    fetchCashFlows();
  }, [fetchCashFlows, refreshKey]);

  // Copy helper
  const handleCopy = (text: string, idKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idKey);
    toast.success('已复制到剪贴板');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Delete handler
  const handleDeleteConfirm = async () => {
    if (!accountAlias || !deletingItem) return;
    setIsDeleting(true);
    try {
      const { error } = await cashFlowService.deleteCashFlow(accountAlias, deletingItem.id);
      if (error) throw error;
      toast.success('现金流水删除成功');
      setDeletingItem(null);
      fetchCashFlows();
    } catch (err: any) {
      console.error('Error deleting cash flow:', err);
      toast.error(err?.message || '删除现金流水失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const isDark = theme === 'dark';

  // Extract all counterparties across items (stable order)
  const allCounterparties = useMemo(() => {
    return extractAllCounterparties(items);
  }, [items]);

  // Tag helper actions
  const toggleCounterpartyTag = useCallback((rawName: string) => {
    setSelectedCounterpartyTags((prev) =>
      prev.includes(rawName) ? prev.filter((n) => n !== rawName) : [...prev, rawName]
    );
  }, []);

  const removeCounterpartyTag = useCallback((rawName: string) => {
    setSelectedCounterpartyTags((prev) => prev.filter((n) => n !== rawName));
  }, []);

  const addKeywordTag = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    // If matches a counterparty (real name or masked name), add as counterparty tag
    const matchedCp = allCounterparties.find((name) => {
      if (name.toLowerCase() === trimmed.toLowerCase()) return true;
      const meta = getCounterpartyMeta(name, allCounterparties, isMasked);
      return meta && meta.displayName.toLowerCase() === trimmed.toLowerCase();
    });

    if (matchedCp) {
      setSelectedCounterpartyTags((prev) =>
        prev.includes(matchedCp) ? prev : [...prev, matchedCp]
      );
    } else {
      setKeywordTags((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    }
    setSearchQuery('');
  }, [allCounterparties, isMasked]);

  const removeKeywordTag = useCallback((kw: string) => {
    setKeywordTags((prev) => prev.filter((k) => k !== kw));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (searchQuery.trim()) {
        addKeywordTag(searchQuery);
      }
    } else if (e.key === 'Backspace' && !searchQuery) {
      // If input is empty, delete the last tag
      if (keywordTags.length > 0) {
        removeKeywordTag(keywordTags[keywordTags.length - 1]);
      } else if (selectedCounterpartyTags.length > 0) {
        removeCounterpartyTag(selectedCounterpartyTags[selectedCounterpartyTags.length - 1]);
      }
    }
  };

  const clearAllFilters = useCallback(() => {
    setStartDate('');
    setEndDate('');
    setTypeFilter('all');
    setSearchQuery('');
    setSelectedCounterpartyTags([]);
    setKeywordTags([]);
  }, []);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Date filter
      if (startDate && item.flow_date < startDate) return false;
      if (endDate && item.flow_date > endDate) return false;

      // Type filter
      if (typeFilter === 'deposit' && item.flow_type !== 'deposit') return false;
      if (typeFilter === 'withdraw' && item.flow_type !== 'withdraw') return false;
      if (typeFilter === 'other' && (item.flow_type === 'deposit' || item.flow_type === 'withdraw')) return false;

      // Counterparty tags filter (OR among selected counterparties)
      if (selectedCounterpartyTags.length > 0) {
        const itemCp = (item.counterparty || '').trim();
        if (!itemCp || !selectedCounterpartyTags.includes(itemCp)) {
          return false;
        }
      }

      // Keyword tags filter (AND among keyword tags)
      if (keywordTags.length > 0) {
        const itemMeta = getCounterpartyMeta(item.counterparty, allCounterparties, isMasked);
        const searchableText = [
          item.counterparty || '',
          itemMeta?.displayName || '',
          item.description || '',
          item.benefit_note || '',
          item.external_id || '',
          item.source || ''
        ].join(' ').toLowerCase();

        for (const kw of keywordTags) {
          if (!searchableText.includes(kw.toLowerCase())) {
            return false;
          }
        }
      }

      // Live search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const meta = getCounterpartyMeta(item.counterparty, allCounterparties, isMasked);
        const matchCounterparty =
          (item.counterparty || '').toLowerCase().includes(query) ||
          (meta ? meta.displayName.toLowerCase().includes(query) : false);
        const matchDesc = (item.description || '').toLowerCase().includes(query);
        const matchNote = (item.benefit_note || '').toLowerCase().includes(query);
        const matchExtId = (item.external_id || '').toLowerCase().includes(query);
        const matchSource = (item.source || '').toLowerCase().includes(query);
        if (!matchCounterparty && !matchDesc && !matchNote && !matchExtId && !matchSource) {
          return false;
        }
      }
      return true;
    });
  }, [
    items,
    startDate,
    endDate,
    typeFilter,
    selectedCounterpartyTags,
    keywordTags,
    searchQuery,
    allCounterparties,
    isMasked
  ]);

  // Statistics
  const stats = useMemo(() => {
    let depositTotal = 0;
    let withdrawTotal = 0;
    let depositCount = 0;
    let withdrawCount = 0;

    for (const item of items) {
      const num = Math.abs(parseFloat(String(item.amount)) || 0);
      if (item.flow_type === 'deposit') {
        depositTotal += num;
        depositCount++;
      } else if (item.flow_type === 'withdraw') {
        withdrawTotal += num;
        withdrawCount++;
      }
    }

    const net = depositTotal - withdrawTotal;
    return {
      totalCount: items.length,
      depositTotal,
      depositCount,
      withdrawTotal,
      withdrawCount,
      net
    };
  }, [items]);

  const formatMoney = (val: number, currency = '¥') => {
    return `${currency} ${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (!accountAlias) {
    return (
      <div className={`${themes[theme].card} rounded-xl p-12 text-center border border-slate-200 dark:border-zinc-800`}>
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
          <Banknote className="w-8 h-8" />
        </div>
        <h3 className={`text-lg font-bold ${themes[theme].text} mb-2`}>请选择账户</h3>
        <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
          请在页面顶部账户选择器中选择需要查看或管理现金流水的账户别名（如 gjzq_option）。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className={`${themes[theme].card} rounded-xl p-4 sm:p-6 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 sm:mt-0">
              <Banknote className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={`text-lg sm:text-xl font-bold ${themes[theme].text}`}>现金流水 (Cash Flows)</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono font-medium">
                  {accountAlias}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5 break-all">
                记录与管理当前账户资金入金、出金与调账流水（/api/accounts/{accountAlias}/cash-flows）
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-between sm:justify-end pt-1 sm:pt-0">
            <button
              onClick={() => setIsMasked(!isMasked)}
              title={isMasked ? '已开启脱敏模式（截图防泄密），点击显示明文' : '点击开启脱敏模式（隐藏真实姓名以防截图泄露）'}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                isMasked
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
              }`}
            >
              {isMasked ? <EyeOff className="w-4 h-4 text-amber-500" /> : <Eye className="w-4 h-4" />}
              <span className="inline">{isMasked ? '脱敏模式' : '明文模式'}</span>
            </button>
            <button
              onClick={() => fetchCashFlows()}
              disabled={loading}
              title="刷新数据"
              className={`p-2.5 rounded-lg text-sm ${themes[theme].secondary} transition-all disabled:opacity-50`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setModalOpen(true);
              }}
              className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium ${themes[theme].primary} transition-all shadow-xs`}
            >
              <Plus className="w-4 h-4" />
              <span>记一笔流水</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Count */}
        <div className={`${themes[theme].card} rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1 text-[11px] sm:text-xs font-medium">
            <span>流水总笔数</span>
            <Filter className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-lg sm:text-2xl font-bold ${themes[theme].text}`}>{stats.totalCount}</span>
            <span className="text-[11px] sm:text-xs text-slate-400">笔记录</span>
          </div>
          <div className="mt-1.5 text-[11px] sm:text-xs text-slate-400 truncate">
            入金 {stats.depositCount} · 出金 {stats.withdrawCount}
          </div>
        </div>

        {/* Total Deposits */}
        <div className={`${themes[theme].card} rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1 text-[11px] sm:text-xs font-medium">
            <span>累计入金 (Deposit)</span>
            <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-base sm:text-xl md:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 truncate">
              {formatMoney(stats.depositTotal)}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] sm:text-xs text-slate-400 truncate">共 {stats.depositCount} 笔入金入账</div>
        </div>

        {/* Total Withdrawals */}
        <div className={`${themes[theme].card} rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 mb-1 text-[11px] sm:text-xs font-medium">
            <span>累计出金 (Withdraw)</span>
            <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-base sm:text-xl md:text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 truncate">
              {formatMoney(stats.withdrawTotal)}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] sm:text-xs text-slate-400 truncate">共 {stats.withdrawCount} 笔资金划转</div>
        </div>

        {/* Net Flow */}
        <div className={`${themes[theme].card} rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1 text-[11px] sm:text-xs font-medium">
            <span>净现金流 (Net Flow)</span>
            {stats.net >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0" />
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-base sm:text-xl md:text-2xl font-bold font-mono truncate ${
                stats.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {stats.net >= 0 ? '+' : ''}
              {formatMoney(stats.net)}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] sm:text-xs text-slate-400 truncate">累计资金净流入 / 流出</div>
        </div>
      </div>

      {/* Co-investment Dividend & Profit Settlement Center */}
      <CashFlowDividendView
        theme={theme}
        accountAlias={accountAlias}
        items={items}
        allCounterparties={allCounterparties}
        isMasked={isMasked}
        onRefreshFlows={fetchCashFlows}
      />

      {/* Counterparty Analytics Charts */}
      <CashFlowCounterpartyCharts
        theme={theme}
        items={items}
        allCounterparties={allCounterparties}
        isMasked={isMasked}
        onToggleMask={() => setIsMasked((m) => !m)}
      />

      {/* Filter and Search Bar with Tag Support */}
      <div className={`${themes[theme].card} rounded-xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-3`}>
        {/* Top: Multi-Tag Integrated Search Bar */}
        <div
          onClick={() => inputRef.current?.focus()}
          className="relative flex flex-wrap items-center gap-1.5 p-2 min-h-[42px] rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all cursor-text"
        >
          <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1 mr-0.5" />

          {/* Active Counterparty Tags */}
          {selectedCounterpartyTags.map((name) => {
            const meta = getCounterpartyMeta(name, allCounterparties, isMasked);
            if (!meta) return null;
            return (
              <span
                key={`cp-tag-${name}`}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 transition-all shadow-2xs"
                style={{
                  borderColor: `${meta.color}55`,
                  backgroundColor: `${meta.color}20`,
                  color: isDark ? '#f4f4f5' : '#18181b',
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                <span className="font-mono">{meta.displayName}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCounterpartyTag(name);
                  }}
                  className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/15 text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
                  title={`移除对手方标签: ${meta.displayName}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {/* Active Keyword Tags */}
          {keywordTags.map((kw) => (
            <span
              key={`kw-tag-${kw}`}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap shrink-0 transition-all shadow-2xs"
            >
              <Tag className="w-3 h-3 opacity-70" />
              <span>{kw}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeKeywordTag(kw);
                }}
                className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 transition-colors"
                title={`移除关键词标签: ${kw}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Inline Text Input */}
          <input
            ref={inputRef}
            type="text"
            placeholder={
              selectedCounterpartyTags.length > 0 || keywordTags.length > 0
                ? '继续输入关键词或回车添加标签...'
                : '搜索对手方、描述、备注、单号（支持输入回车转为标签）...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-[150px] bg-transparent text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-hidden py-0.5 px-1"
          />

          {/* Quick Clear in Search Bar */}
          {(selectedCounterpartyTags.length > 0 || keywordTags.length > 0 || searchQuery.trim()) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedCounterpartyTags([]);
                setKeywordTags([]);
                setSearchQuery('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0 ml-auto"
              title="清空搜索与所有标签"
            >
              清空
            </button>
          )}
        </div>

        {/* Quick Counterparty Tags Row (click to add/remove) */}
        {allCounterparties.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              快捷对手方标签:
            </span>
            {allCounterparties.map((name) => {
              const meta = getCounterpartyMeta(name, allCounterparties, isMasked);
              if (!meta) return null;
              const isSelected = selectedCounterpartyTags.includes(meta.rawName);
              return (
                <button
                  key={meta.rawName}
                  type="button"
                  onClick={() => toggleCounterpartyTag(meta.rawName)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all ${
                    isSelected
                      ? 'shadow-2xs font-semibold'
                      : 'opacity-65 hover:opacity-100'
                  }`}
                  style={{
                    borderColor: isSelected ? meta.color : `${meta.color}40`,
                    backgroundColor: isSelected ? `${meta.color}25` : `${meta.color}08`,
                    color: isDark ? '#f4f4f5' : '#18181b',
                  }}
                  title={isSelected ? `点击移除标签: ${meta.displayName}` : `点击添加标签: ${meta.displayName}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                  <span>{meta.displayName}</span>
                  {isSelected ? (
                    <X className="w-2.5 h-2.5 opacity-75 hover:opacity-100 ml-0.5" />
                  ) : (
                    <Plus className="w-2.5 h-2.5 opacity-50 ml-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Bottom Row: Type filter, Start Date, End Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-1 border-t border-slate-100 dark:border-zinc-800/60">
          {/* Type filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部类型 (All Types)</option>
              <option value="deposit">仅入金 (Deposit)</option>
              <option value="withdraw">仅出金 (Withdraw)</option>
              <option value="other">其它类型 (Other)</option>
            </select>
          </div>

          {/* Date range: start */}
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              placeholder="开始日期"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 min-h-[38px] text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date range: end */}
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              placeholder="结束日期"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 min-h-[38px] text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Filter Summary & Reset Bar */}
        {(startDate || endDate || searchQuery || typeFilter !== 'all' || selectedCounterpartyTags.length > 0 || keywordTags.length > 0) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <span>
                已过滤出 <strong className="text-slate-800 dark:text-zinc-200">{filteredItems.length}</strong> 笔流水（共 {items.length} 笔）
              </span>
              {(selectedCounterpartyTags.length > 0 || keywordTags.length > 0) && (
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  · 已激活 {selectedCounterpartyTags.length + keywordTags.length} 个标签筛选
                </span>
              )}
            </div>
            <button
              onClick={clearAllFilters}
              className="text-blue-500 hover:underline font-medium shrink-0 ml-2"
            >
              清空所有筛选条件
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchCashFlows()}
            className="px-3 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-xs font-medium"
          >
            重试
          </button>
        </div>
      )}

      {/* Data Table */}
      <div className={`${themes[theme].card} rounded-xl border border-slate-200/80 dark:border-zinc-800 shadow-xs overflow-hidden`}>
        {/* Mobile horizontal scroll hint banner */}
        <div className="sm:hidden px-3.5 py-2 bg-slate-50/90 dark:bg-zinc-900/90 border-b border-slate-100 dark:border-zinc-800 text-[11px] text-slate-400 dark:text-zinc-500 flex items-center justify-between">
          <span>↔ 左右滑动可查看完整流水明细</span>
          <span className="font-mono">共 {filteredItems.length} 笔</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/70 text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold whitespace-nowrap">
                <th className="py-3 px-4 whitespace-nowrap">流水日期</th>
                <th className="py-3 px-4 whitespace-nowrap">类型</th>
                <th className="py-3 px-4 whitespace-nowrap">金额</th>
                <th className="py-3 px-4 whitespace-nowrap">对手方</th>
                <th className="py-3 px-4 min-w-[140px]">描述</th>
                <th className="py-3 px-4 min-w-[140px]">权益说明 / 备注</th>
                <th className="py-3 px-4 whitespace-nowrap">外部单号</th>
                <th className="py-3 px-4 whitespace-nowrap">来源</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                    <span>正在加载现金流水...</span>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Banknote className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">暂无现金流水记录</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {items.length === 0 ? '点击右上角“记一笔流水”开始记录资金流向' : '未匹配到符合当前筛选条件的流水'}
                    </p>
                    {items.length === 0 && (
                      <button
                        onClick={() => {
                          setEditingItem(null);
                          setModalOpen(true);
                        }}
                        className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${themes[theme].primary}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        记第一笔流水
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isDeposit = item.flow_type === 'deposit';
                  const isWithdraw = item.flow_type === 'withdraw';
                  const rawAmount = parseFloat(String(item.amount)) || 0;
                  const absAmount = Math.abs(rawAmount);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* Flow Date */}
                      <td className={`py-3 px-4 font-mono font-medium ${themes[theme].text} whitespace-nowrap`}>
                        {item.flow_date}
                      </td>

                      {/* Flow Type Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isDeposit ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <ArrowDownLeft className="w-3 h-3" />
                            入金
                          </span>
                        ) : isWithdraw ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            <ArrowUpRight className="w-3 h-3" />
                            出金
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                            {item.flow_type}
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            isDeposit
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isWithdraw
                              ? 'text-rose-600 dark:text-rose-400'
                              : themes[theme].text
                          }
                        >
                          {isDeposit ? '+' : isWithdraw ? '-' : rawAmount < 0 ? '-' : ''}
                          {absAmount.toLocaleString('zh-CN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                          <span className="text-xs font-normal text-slate-400 ml-1">
                            {item.currency || 'CNY'}
                          </span>
                        </span>
                      </td>

                      {/* Counterparty */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.counterparty ? (
                          (() => {
                            const meta = getCounterpartyMeta(item.counterparty, allCounterparties, isMasked);
                            if (!meta) return <span className="text-slate-300 dark:text-zinc-600">-</span>;
                            const isSelected = selectedCounterpartyTags.includes(meta.rawName);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCounterpartyTag(meta.rawName);
                                }}
                                title={
                                  isSelected
                                    ? `已作为标签筛选: ${meta.displayName} (点击取消筛选)`
                                    : `对手方: ${meta.displayName} (点击添加为筛选标签)`
                                }
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 cursor-pointer transition-all select-all shadow-2xs ${
                                  isSelected ? 'ring-2 ring-blue-500/70 font-semibold' : 'hover:opacity-85'
                                }`}
                                style={{
                                  borderColor: isSelected ? meta.color : `${meta.color}50`,
                                  backgroundColor: isSelected ? `${meta.color}30` : `${meta.color}15`,
                                  color: isDark ? '#f4f4f5' : '#18181b',
                                }}
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: meta.color }}
                                />
                                <span className="font-medium font-mono">{meta.displayName}</span>
                                {isSelected && (
                                  <Check className="w-3 h-3 ml-0.5" style={{ color: meta.color }} />
                                )}
                              </button>
                            );
                          })()
                        ) : (
                          <span className="text-slate-300 dark:text-zinc-600">-</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className={`py-3 px-4 max-w-xs truncate ${themes[theme].text}`} title={item.description || ''}>
                        {item.description || <span className="text-slate-300 dark:text-zinc-600">-</span>}
                      </td>

                      {/* Benefit Note */}
                      <td className={`py-3 px-4 max-w-xs truncate text-slate-600 dark:text-zinc-300`} title={item.benefit_note || ''}>
                        {item.benefit_note || <span className="text-slate-300 dark:text-zinc-600">-</span>}
                      </td>

                      {/* External ID */}
                      <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                        {item.external_id ? (
                          <div className="flex items-center gap-1.5 group">
                            <span className="text-slate-500 dark:text-zinc-400 max-w-[140px] truncate" title={item.external_id}>
                              {item.external_id}
                            </span>
                            <button
                              onClick={() => handleCopy(item.external_id!, `ext-${item.id}`)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 transition-opacity text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                              title="复制单号"
                            >
                              {copiedId === `ext-${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-zinc-600">-</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-mono">
                          {item.source || 'manual'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setModalOpen(true);
                            }}
                            title="编辑流水"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingItem(item)}
                            title="删除流水"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <CashFlowModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        onSuccess={() => {
          fetchCashFlows();
        }}
        theme={theme}
        accountAlias={accountAlias}
        initialData={editingItem}
      />

      {/* Delete Confirmation Dialog */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`${themes[theme].card} w-full max-w-md rounded-xl shadow-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-4`}>
            <div className="flex items-center gap-3 text-red-500">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className={`text-lg font-bold ${themes[theme].text}`}>确认删除此现金流水？</h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-zinc-300">
              确定要删除 <strong className="font-mono">{deletingItem.flow_date}</strong> 的流水记录吗？
              <br />
              类型：<span className="font-semibold">{deletingItem.flow_type === 'deposit' ? '入金' : deletingItem.flow_type === 'withdraw' ? '出金' : deletingItem.flow_type}</span>
              ，金额：<span className="font-mono font-bold">{Math.abs(parseFloat(String(deletingItem.amount)) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {deletingItem.currency}</span>
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={isDeleting}
                className={`px-4 py-2 text-sm font-medium rounded-lg ${themes[theme].secondary}`}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
