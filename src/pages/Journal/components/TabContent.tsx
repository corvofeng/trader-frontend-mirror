import React from 'react';
import { Briefcase, RefreshCw } from 'lucide-react';
import { TradeForm, TradeList } from '../../../features/trading';
import { Portfolio } from '../../../features/portfolio';
import { OperationsView, UploadPage } from '../features';
import { RelatedLinks } from '../../../shared/components';
import { stockService } from '../../../lib/services';
import { themes, Theme } from '../../../lib/theme';
import type { Stock, Holding, Trade, StockOrder } from '../../../lib/services/types';
import { AnalysisTab } from './AnalysisTab';

const getOrderStatusBadge = (raw?: string | null) => {
  const s = (raw || '').trim().toUpperCase();
  if (s.includes('FILLED') || s === 'ALLTRADED') return { label: raw || 'FILLED', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' };
  if (s.includes('PART') || s.includes('PARTTRADED')) return { label: raw || 'PART', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' };
  if (s.includes('CANCEL') || s.includes('CANCELED') || s.includes('CANCELLED')) return { label: raw || 'CANCELED', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
  if (s.includes('REJECT') || s.includes('ERROR') || s.includes('FAIL')) return { label: raw || 'REJECTED', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' };
  if (s.includes('REPORT') || s.includes('SUBMIT')) return { label: raw || 'REPORTED', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' };
  if (!raw) return { label: '-', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
  return { label: raw, className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
};

interface TabContentProps {
  activeTab: string;
  selectedStock: Stock | null;
  theme: Theme;
  holdings: Holding[];
  recentTrades: Trade[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  portfolioUuid: string | null;
  userId?: string;
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string) => void;
}

export function TabContent({
  activeTab,
  selectedStock,
  theme,
  holdings,
  recentTrades,
  dateRange,
  onDateRangeChange,
  portfolioUuid,
  userId,
  selectedAccountId,
  onAccountChange
}: TabContentProps) {
  const isSharedView = !!portfolioUuid;

  const [todayOrders, setTodayOrders] = React.useState<StockOrder[]>([]);
  const [todayOrdersLoading, setTodayOrdersLoading] = React.useState(false);
  const [todayOrdersError, setTodayOrdersError] = React.useState<string | null>(null);
  const [todayOrdersLastUpdatedAt, setTodayOrdersLastUpdatedAt] = React.useState<number | null>(null);

  const sortedTodayOrders = React.useMemo(() => {
    const next = [...todayOrders];
    next.sort((a, b) => {
      const at = a.order_time ? Date.parse(a.order_time.replace(' ', 'T')) : NaN;
      const bt = b.order_time ? Date.parse(b.order_time.replace(' ', 'T')) : NaN;
      if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at;
      if (Number.isFinite(bt)) return 1;
      if (Number.isFinite(at)) return -1;
      return String(b.order_time || '').localeCompare(String(a.order_time || ''));
    });
    return next;
  }, [todayOrders]);

  const fetchTodayOrders = React.useCallback(async () => {
    const accountAlias = selectedAccountId || undefined;
    if (!accountAlias) {
      setTodayOrders([]);
      setTodayOrdersError('请选择账户后再查看当日订单。');
      return;
    }
    setTodayOrdersLoading(true);
    setTodayOrdersError(null);
    try {
      const { data, error } = await stockService.getTodayOrders(accountAlias);
      if (error) throw error;
      setTodayOrders(data || []);
      setTodayOrdersLastUpdatedAt(Date.now());
    } catch (e) {
      setTodayOrders([]);
      setTodayOrdersError(e instanceof Error ? e.message : '加载当日订单失败');
    } finally {
      setTodayOrdersLoading(false);
    }
  }, [selectedAccountId]);

  React.useEffect(() => {
    if (activeTab !== 'trades' || portfolioUuid) return;
    fetchTodayOrders();
  }, [activeTab, fetchTodayOrders, portfolioUuid]);

  if (activeTab === 'portfolio') {
    return (
        <Portfolio
        holdings={holdings}
        theme={theme}
        recentTrades={recentTrades}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        isSharedView={isSharedView}
        userId={userId}
        selectedAccountId={selectedAccountId}
        onAccountChange={(accountId) => {
          onAccountChange?.(accountId);
          if (accountId) {
            localStorage.setItem('journalAccountId', accountId);
            localStorage.setItem('journalSelectedAccountAlias', accountId);
          }
        }}
      />
    );
  }

  if (activeTab === 'trades' && !portfolioUuid) {
    return (
      <div className="flex flex-col gap-6">
        <TradeForm 
          selectedStock={selectedStock} 
          theme={theme} 
          accountAlias={selectedAccountId}
        />
        <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden transition-colors duration-200`}>
          <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>当日订单</div>
                <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                  {todayOrdersLastUpdatedAt ? `更新于 ${new Date(todayOrdersLastUpdatedAt).toLocaleTimeString()}` : ' '}
                </div>
              </div>
              <button
                onClick={fetchTodayOrders}
                disabled={todayOrdersLoading}
                className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${themes[theme].secondary} ${
                  todayOrdersLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${todayOrdersLoading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {todayOrdersLoading && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>正在加载当日订单…</div>
            )}
            {!todayOrdersLoading && todayOrdersError && (
              <div className="text-sm text-red-500 break-words">{todayOrdersError}</div>
            )}
            {!todayOrdersLoading && !todayOrdersError && sortedTodayOrders.length === 0 && (
              <div className={`text-sm ${themes[theme].text} opacity-75`}>当日暂无订单。</div>
            )}
            {!todayOrdersLoading && !todayOrdersError && sortedTodayOrders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">时间</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">标的</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">动作</th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">状态</th>
                      <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">价格(成/限)</th>
                      <th className="px-3 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">数量(成/委)</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">系统号</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">备注/错误</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedTodayOrders.map((order, idx) => {
                      const status = getOrderStatusBadge(order.order_status_name);
                      const timeText = order.order_time?.includes(' ')
                        ? order.order_time.split(' ')[1]?.slice(0, 8)
                        : (order.order_time || '-');
                      const symbol = order.contract_code_full || order.instrument_id || '-';
                      const name = order.instrument_name || '';
                      const traded = Number.isFinite(order.traded_price) ? order.traded_price : null;
                      const limit = Number.isFinite(order.limit_price) ? order.limit_price : null;
                      const priceText = `${traded != null ? traded.toFixed(4) : '-'} / ${limit != null ? limit.toFixed(4) : '-'}`;
                      const qtyText = `${order.volume_traded ?? 0}/${order.volume_total_original ?? 0}`;
                      const note = order.error_msg || order.remark || '-';

                      const opName = order.op_type_name_zh || order.op_type_name || '-';
                      const isBuy = opName.includes('买') || opName.toUpperCase().includes('BUY') || opName.includes('开仓') || opName.includes('B');
                      const isSell = opName.includes('卖') || opName.toUpperCase().includes('SELL') || opName.includes('平仓') || opName.includes('S');

                      return (
                        <tr key={`${order.order_sys_id || symbol || order.order_time || 'na'}-${idx}`}>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{timeText}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                            <div className="font-mono">{symbol}</div>
                            {name ? <div className="opacity-75">{name}</div> : null}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                isBuy
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : isSell
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {opName}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`} title={order.order_status_name || undefined}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono text-right">{priceText}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono text-right">{qtyText}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{order.order_sys_id || '-'}</td>
                          <td className="px-3 py-3 text-xs text-gray-700 dark:text-gray-200 break-words">{note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} selectedAccountId={selectedAccountId} />
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=trades" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'history' && !portfolioUuid) {
    return (
      <div className="space-y-6">
        <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
          <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Completed Trades</h2>
          <TradeList selectedStockCode={selectedStock?.stock_code} theme={theme} showCompleted={true} />
        </div>
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=history" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'upload' && !portfolioUuid) {
    return (
      <div className="space-y-6">
        <UploadPage theme={theme} />
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=upload" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'operations' && !portfolioUuid) {
    return (
      <div className="space-y-6">
        <OperationsView theme={theme} accountAlias={selectedAccountId} />
        <RelatedLinks 
          theme={theme} 
          currentPath="/journal?tab=operations" 
          maxItems={3}
        />
      </div>
    );
  }

  if (activeTab === 'analysis') {
    return (
      <AnalysisTab
        theme={theme}
        portfolioUuid={portfolioUuid}
        userId={userId}
        selectedAccountId={selectedAccountId}
        activeTab={activeTab}
      />
    );
  }

  if (activeTab === 'settings' && !portfolioUuid) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-4 sm:p-6`}>
        <h2 className={`text-xl sm:text-2xl font-bold mb-4 ${themes[theme].text}`}>Account Settings</h2>
        <p className={`${themes[theme].text} opacity-70`}>
          Account and preferences settings coming soon...
        </p>
        <div className="mt-6">
          <RelatedLinks 
            theme={theme} 
            currentPath="/journal?tab=settings" 
            maxItems={3}
          />
        </div>
      </div>
    );
  }

  // Show message for restricted tabs in shared view
  if (portfolioUuid && !['portfolio', 'analysis'].includes(activeTab)) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
        <div className={`${themes[theme].text} opacity-70`}>
          <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">This feature is not available in shared portfolio view</p>
          <p className="text-sm">Switch to Portfolio or Analysis tab to view shared data</p>
        </div>
      </div>
    );
  }

  return null;
}
