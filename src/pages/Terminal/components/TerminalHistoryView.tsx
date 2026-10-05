import { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { History as HistoryIcon } from 'lucide-react';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';
import { optionsService } from '../../../lib/services';
import type { OptionOrder, Trade } from '../../../lib/services/types';
import { JournalOrdersTabContent } from '../../Journal/components/JournalOrdersTabContent';
import { TradesTable } from '../../../features/portfolio/components/TradesTable';

interface TerminalHistoryViewProps {
  theme: Theme;
  selectedAccountId: string | null;
  recentTrades: Trade[];
  dateRange: { startDate: string; endDate: string };
}

type HistorySubCategory = 'options' | 'stocks';

export const TerminalHistoryView: React.FC<TerminalHistoryViewProps> = ({
  theme,
  selectedAccountId,
  recentTrades,
}) => {
  const [subCategory, setSubCategory] = useState<HistorySubCategory>('options');
  const [selectedDate, setSelectedDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [orders, setOrders] = useState<OptionOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // TradesTable 状态
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPerPage, setTradesPerPage] = useState(10);
  const [tradesSort, setTradesSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'created_at',
    direction: 'desc',
  });

  const sortedTrades = useMemo(() => {
    const list = [...recentTrades];
    list.sort((a, b) => {
      const field = tradesSort.field as keyof Trade;
      const valA = a[field] ?? '';
      const valB = b[field] ?? '';
      if (typeof valA === 'string' && typeof valB === 'string') {
        return tradesSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return tradesSort.direction === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
    return list;
  }, [recentTrades, tradesSort]);

  const totalTradesPages = Math.ceil(sortedTrades.length / tradesPerPage) || 1;
  const paginatedTrades = useMemo(() => {
    const start = (tradesPage - 1) * tradesPerPage;
    return sortedTrades.slice(start, start + tradesPerPage);
  }, [sortedTrades, tradesPage, tradesPerPage]);

  const handleTradesSort = (field: string) => {
    setTradesSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const fetchOrders = useCallback(async (dateToFetch?: string) => {
    const targetDate = dateToFetch || selectedDate;
    if (!selectedAccountId) {
      setOrders([]);
      setOrdersError('请选择账户后查看成交流水');
      return;
    }
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const resp = await optionsService.getAdminOrders(selectedAccountId, { date: targetDate });
      if (resp.error) throw resp.error;
      setOrders(resp.data || []);
    } catch (e) {
      setOrders([]);
      setOrdersError(e instanceof Error ? e.message : '加载成交流水失败');
    } finally {
      setOrdersLoading(false);
    }
  }, [selectedAccountId, selectedDate]);

  useEffect(() => {
    if (subCategory === 'options') {
      fetchOrders();
    }
  }, [subCategory, fetchOrders]);

  return (
    <div className="space-y-4 pb-20">
      {/* 顶部 M3 Segmented Chips */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 w-fit">
        <button
          type="button"
          onClick={() => setSubCategory('options')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium btn-tactile transition-all duration-150 ${
            subCategory === 'options'
              ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
          }`}
        >
          期权成交流水 (Option Orders)
        </button>
        <button
          type="button"
          onClick={() => setSubCategory('stocks')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium btn-tactile transition-all duration-150 ${
            subCategory === 'stocks'
              ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
              : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
          }`}
        >
          现货历史交易 (Stock Trades)
        </button>
      </div>

      {/* 视图内容：复用现有的专业订单与流水组件 */}
      {subCategory === 'options' ? (
        <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
          <JournalOrdersTabContent
            theme={theme}
            selectedAccountId={selectedAccountId}
            orders={orders}
            ordersLoading={ordersLoading}
            ordersError={ordersError}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              fetchOrders(date);
            }}
            onRefreshOrders={() => fetchOrders(selectedDate)}
          />
        </div>
      ) : (
        <div className={`${themes[theme].card} rounded-2xl p-4 sm:p-5 border ${themes[theme].border} shadow-2xs`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <HistoryIcon className="w-4 h-4 text-blue-500" />
              <span>现货成交历史</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              共 {recentTrades.length} 条记录
            </span>
          </div>
          <TradesTable
            theme={theme}
            trades={recentTrades}
            paginatedTrades={paginatedTrades}
            tradesPage={tradesPage}
            tradesPerPage={tradesPerPage}
            totalTradesPages={totalTradesPages}
            onTradesPageChange={setTradesPage}
            onTradesPerPageChange={setTradesPerPage}
            sort={tradesSort}
            onSort={handleTradesSort}
          />
        </div>
      )}
    </div>
  );
};
