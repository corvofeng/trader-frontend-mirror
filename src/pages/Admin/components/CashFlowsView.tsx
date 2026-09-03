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
  EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Theme, themes } from '../../../lib/theme';
import { cashFlowService } from '../../../lib/services';
import type { CashFlowItem } from '../../../lib/services/types';
import { CashFlowModal } from './CashFlowModal';
import { CashFlowCounterpartyCharts, getCounterpartyMask } from './CashFlowCounterpartyCharts';

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

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchCounterparty = (item.counterparty || '').toLowerCase().includes(query);
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
  }, [items, startDate, endDate, typeFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let depositTotal = 0;
    let withdrawTotal = 0;
    let depositCount = 0;
    let withdrawCount = 0;

    for (const item of items) {
      const num = parseFloat(String(item.amount)) || 0;
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
      <div className={`${themes[theme].card} rounded-xl p-5 sm:p-6 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <Banknote className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-xl font-bold ${themes[theme].text}`}>现金流水 (Cash Flows)</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono font-medium">
                  {accountAlias}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                记录与管理当前账户资金入金、出金与调账流水（/api/accounts/{accountAlias}/cash-flows）
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
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
              <span className="hidden sm:inline">{isMasked ? '脱敏模式' : '明文模式'}</span>
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
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${themes[theme].primary} transition-all shadow-xs`}
            >
              <Plus className="w-4 h-4" />
              <span>记一笔流水</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Count */}
        <div className={`${themes[theme].card} rounded-xl p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1 text-xs font-medium">
            <span>流水总笔数</span>
            <Filter className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${themes[theme].text}`}>{stats.totalCount}</span>
            <span className="text-xs text-slate-400">笔记录</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            入金 {stats.depositCount} 笔 · 出金 {stats.withdrawCount} 笔
          </div>
        </div>

        {/* Total Deposits */}
        <div className={`${themes[theme].card} rounded-xl p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1 text-xs font-medium">
            <span>累计入金 (Deposit)</span>
            <ArrowDownLeft className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatMoney(stats.depositTotal)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">共 {stats.depositCount} 笔入金入账</div>
        </div>

        {/* Total Withdrawals */}
        <div className={`${themes[theme].card} rounded-xl p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 mb-1 text-xs font-medium">
            <span>累计出金 (Withdraw)</span>
            <ArrowUpRight className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
              {formatMoney(stats.withdrawTotal)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">共 {stats.withdrawCount} 笔资金划转</div>
        </div>

        {/* Net Flow */}
        <div className={`${themes[theme].card} rounded-xl p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs`}>
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1 text-xs font-medium">
            <span>净现金流 (Net Cash Flow)</span>
            {stats.net >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold font-mono ${
                stats.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {stats.net >= 0 ? '+' : ''}
              {formatMoney(stats.net)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">累计资金净流入 / 流出</div>
        </div>
      </div>

      {/* Counterparty Analytics Charts */}
      <CashFlowCounterpartyCharts
        theme={theme}
        items={items}
        isMasked={isMasked}
        onToggleMask={() => setIsMasked((m) => !m)}
      />

      {/* Filter and Search Bar */}
      <div className={`${themes[theme].card} rounded-xl p-4 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-3`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search query */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索对手方、描述、备注、单号..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

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
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {(startDate || endDate || searchQuery || typeFilter !== 'all') && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-xs text-slate-500">
            <span>
              已过滤出 <strong className="text-slate-800 dark:text-zinc-200">{filteredItems.length}</strong> 笔流水（共 {items.length} 笔）
            </span>
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setTypeFilter('all');
                setSearchQuery('');
              }}
              className="text-blue-500 hover:underline"
            >
              清空筛选条件
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/70 text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">流水日期</th>
                <th className="py-3 px-4">类型</th>
                <th className="py-3 px-4">金额</th>
                <th className="py-3 px-4">对手方</th>
                <th className="py-3 px-4">描述</th>
                <th className="py-3 px-4">权益说明 / 备注</th>
                <th className="py-3 px-4">外部单号</th>
                <th className="py-3 px-4">来源</th>
                <th className="py-3 px-4 text-right">操作</th>
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
                  const amountNum = parseFloat(String(item.amount)) || 0;

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
                          {isDeposit ? '+' : isWithdraw ? '-' : ''}
                          {amountNum.toLocaleString('zh-CN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                          <span className="text-xs font-normal text-slate-400 ml-1">
                            {item.currency || 'CNY'}
                          </span>
                        </span>
                      </td>

                      {/* Counterparty */}
                      <td className={`py-3 px-4 ${themes[theme].text}`}>
                        {item.counterparty ? (
                          <span className="font-medium">
                            {isMasked
                              ? getCounterpartyMask(item.counterparty)
                              : item.counterparty}
                          </span>
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
              ，金额：<span className="font-mono font-bold">{deletingItem.amount} {deletingItem.currency}</span>
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
