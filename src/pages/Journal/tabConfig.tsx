import React, { type ReactNode } from 'react';
import { Briefcase, LayoutGrid, RefreshCw } from 'lucide-react';
import { Portfolio } from '../../features/portfolio';
import { StockSearch, TradeForm, TradeList } from '../../features/trading';
import { optionsService } from '../../lib/services';
import { themes, type Theme } from '../../lib/theme';
import type { Holding, Stock, StockOrder, Trade, User } from '../../lib/services/types';
import { normalizeTab } from '../../shared/utils/tabRouting';
import { JournalContractQuotePanel } from './components/JournalContractQuotePanel';

type JournalTabVisibilityContext = {
  canViewTradePlans: boolean;
};

export type JournalTab = 'portfolio' | 'trades';

export type JournalTabRenderContext = {
  activeTab: JournalTab;
  selectedStock: Stock | null;
  theme: Theme;
  onStockSelect: (stock: Stock) => void;
  user: User | null;
  holdings: Holding[];
  recentTrades: Trade[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  portfolioUuid: string | null;
  userId: string;
  selectedAccountId: string | null;
  onAccountChange: (accountId: string) => void;
  isSnapshot: boolean;
  todayOrders: StockOrder[];
  todayOrdersLoading: boolean;
  todayOrdersError: string | null;
  todayOrdersLastUpdatedAt: number | null;
  onRefreshTodayOrders: () => void;
};

export type JournalTabDefinition = {
  id: JournalTab;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  isVisible: (context: JournalTabVisibilityContext) => boolean;
  renderToolbar?: (context: JournalTabRenderContext) => ReactNode;
  renderContent: (context: JournalTabRenderContext) => ReactNode;
};

export const JOURNAL_DEFAULT_TAB: JournalTab = 'portfolio';

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

const renderRestrictedSharedView = (theme: Theme) => (
  <div className={`${themes[theme].card} rounded-lg p-8 text-center`}>
    <div className={`${themes[theme].text} opacity-70`}>
      <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-40" />
      <p className="text-lg font-medium">This feature is not available in shared portfolio view</p>
      <p className="text-sm">Switch to Portfolio tab to view shared data</p>
    </div>
  </div>
);

function JournalTradesTabContent({
  selectedStock,
  theme,
  selectedAccountId,
  todayOrders,
  todayOrdersLoading,
  todayOrdersError,
  todayOrdersLastUpdatedAt,
  onRefreshTodayOrders,
}: Pick<
  JournalTabRenderContext,
  | 'selectedStock'
  | 'theme'
  | 'selectedAccountId'
  | 'todayOrders'
  | 'todayOrdersLoading'
  | 'todayOrdersError'
  | 'todayOrdersLastUpdatedAt'
  | 'onRefreshTodayOrders'
>) {
  const [selectedContractCode, setSelectedContractCode] = React.useState<string | null>(null);
  const [selectedContractName, setSelectedContractName] = React.useState<string | null>(null);
  const [selectedQuotePrice, setSelectedQuotePrice] = React.useState<number | null>(null);
  const [selectedQuoteSide, setSelectedQuoteSide] = React.useState<'bid' | 'ask' | null>(null);
  const [selectedQuoteLevel, setSelectedQuoteLevel] = React.useState<number | null>(null);

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

  React.useEffect(() => {
    const code = selectedStock?.stock_code?.trim();
    if (!code) return;
    setSelectedContractCode(code);
    setSelectedContractName(selectedStock?.stock_name || code);
    setSelectedQuotePrice(null);
    setSelectedQuoteSide(null);
    setSelectedQuoteLevel(null);

    let cancelled = false;

    const resolveCanonicalSymbol = async () => {
      try {
        const { data, error } = await optionsService.getOptionsData(code);
        if (cancelled || error) return;
        const canonicalCode = data?.opt_undl_code_full?.trim();
        if (!canonicalCode || canonicalCode === code) return;
        setSelectedContractCode(canonicalCode);
      } catch {
        // Use the raw selected stock code when canonicalization is unavailable.
      }
    };

    void resolveCanonicalSymbol();

    return () => {
      cancelled = true;
    };
  }, [selectedStock]);

  React.useEffect(() => {
    if (selectedContractCode) return;
    const latestOrder = sortedTodayOrders.find((order) => {
      const code = (order.contract_code_full || order.instrument_id || '').trim();
      return code.length > 0;
    });
    if (!latestOrder) return;
    setSelectedContractCode((latestOrder.contract_code_full || latestOrder.instrument_id || '').trim());
    setSelectedContractName(latestOrder.instrument_name || null);
  }, [selectedContractCode, sortedTodayOrders]);

  const handleSelectContract = React.useCallback((code: string, name?: string) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    setSelectedContractCode(trimmedCode);
    setSelectedContractName(name || null);
    setSelectedQuotePrice(null);
    setSelectedQuoteSide(null);
    setSelectedQuoteLevel(null);
  }, []);

  const handleSelectQuotePrice = React.useCallback((price: number, side?: 'bid' | 'ask', level?: number) => {
    if (!Number.isFinite(price)) return;
    setSelectedQuotePrice(price);
    setSelectedQuoteSide(side || null);
    setSelectedQuoteLevel(level ?? null);
  }, []);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <TradeForm
        selectedStock={selectedStock}
        theme={theme}
        accountAlias={selectedAccountId}
        preferredTargetPrice={selectedQuotePrice}
      />
      <JournalContractQuotePanel
        contractCode={selectedContractCode}
        contractName={selectedContractName}
        theme={theme}
        selectedQuotePrice={selectedQuotePrice}
        selectedQuoteSide={selectedQuoteSide}
        selectedQuoteLevel={selectedQuoteLevel}
        onSelectPrice={handleSelectQuotePrice}
      />
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden transition-colors duration-200`}>
        <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>当日订单</div>
              <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                {todayOrdersLastUpdatedAt ? `更新于 ${new Date(todayOrdersLastUpdatedAt).toLocaleTimeString()}` : ' '}
              </div>
              <div className={`text-xs ${themes[theme].text} opacity-60 mt-1`}>
                点击合约代码可直接在上方加载该合约盘口，点击盘口价格可回填目标价。
              </div>
            </div>
            <button
              onClick={onRefreshTodayOrders}
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
                    <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">价格(成/限)</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">数量(成/委)</th>
                    <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">系统号</th>
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
                    const isSelected = !!selectedContractCode && selectedContractCode === symbol;
                    const isBuy = (order.op_type_name_zh || order.op_type_name || '').toUpperCase().includes('BUY') || (order.op_type_name_zh || '').includes('买');
                    const isSell = (order.op_type_name_zh || order.op_type_name || '').toUpperCase().includes('SELL') || (order.op_type_name_zh || '').includes('卖');

                    return (
                      <tr
                        key={`${order.order_sys_id || symbol || order.order_time || 'na'}-${idx}`}
                        className={isSelected ? 'bg-blue-50 dark:bg-blue-950/20' : undefined}
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200 font-mono">{timeText}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-200">
                          {symbol !== '-' ? (
                            <button
                              type="button"
                              onClick={() => handleSelectContract(symbol, name)}
                              className="text-left hover:underline"
                            >
                              <div className="font-mono">{symbol}</div>
                              {name ? <div className="opacity-75">{name}</div> : null}
                            </button>
                          ) : (
                            <>
                              <div className="font-mono">{symbol}</div>
                              {name ? <div className="opacity-75">{name}</div> : null}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-xs text-gray-700 dark:text-gray-200">
                          <span className={isBuy ? 'text-green-600 dark:text-green-400' : isSell ? 'text-red-600 dark:text-red-400' : ''}>
                            {order.op_type_name_zh || order.op_type_name || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-xs text-gray-700 dark:text-gray-200">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`} title={order.order_status_name || undefined}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-xs text-gray-700 dark:text-gray-200 font-mono">{priceText}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-xs text-gray-700 dark:text-gray-200 font-mono">{qtyText}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-center text-xs text-gray-700 dark:text-gray-200 font-mono">{order.order_sys_id || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-200 break-words">{note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <TradeList
        selectedStockCode={selectedStock?.stock_code}
        theme={theme}
        selectedAccountId={selectedAccountId}
      />
    </div>
  );
}

export const JOURNAL_TAB_DEFINITIONS: readonly JournalTabDefinition[] = [
  {
    id: 'portfolio',
    name: 'Portfolio',
    icon: Briefcase,
    isVisible: () => true,
    renderContent: ({
      holdings,
      theme,
      recentTrades,
      dateRange,
      onDateRangeChange,
      portfolioUuid,
      userId,
      selectedAccountId,
      onAccountChange,
      isSnapshot,
    }) => (
      <Portfolio
        holdings={holdings}
        theme={theme}
        recentTrades={recentTrades}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        isSharedView={!!portfolioUuid}
        userId={userId}
        selectedAccountId={selectedAccountId}
        onAccountChange={onAccountChange}
        isSnapshot={isSnapshot}
      />
    ),
  },
  {
    id: 'trades',
    name: 'Trade Plans',
    icon: LayoutGrid,
    isVisible: ({ canViewTradePlans }) => canViewTradePlans,
    renderToolbar: ({ portfolioUuid, onStockSelect, selectedStock }) => {
      if (portfolioUuid) return null;
      return (
        <div className="w-full">
          <StockSearch
            onSelect={onStockSelect}
            selectedStockCode={selectedStock?.stock_code}
          />
        </div>
      );
    },
    renderContent: ({
      portfolioUuid,
      selectedStock,
      theme,
      selectedAccountId,
      todayOrders,
      todayOrdersLoading,
      todayOrdersError,
      todayOrdersLastUpdatedAt,
      onRefreshTodayOrders,
    }) => {
      if (portfolioUuid) {
        return renderRestrictedSharedView(theme);
      }
      return (
        <JournalTradesTabContent
          selectedStock={selectedStock}
          theme={theme}
          selectedAccountId={selectedAccountId}
          todayOrders={todayOrders}
          todayOrdersLoading={todayOrdersLoading}
          todayOrdersError={todayOrdersError}
          todayOrdersLastUpdatedAt={todayOrdersLastUpdatedAt}
          onRefreshTodayOrders={onRefreshTodayOrders}
        />
      );
    },
  },
] as const;

export const getJournalTabDefinitions = (context: JournalTabVisibilityContext) =>
  JOURNAL_TAB_DEFINITIONS.filter((tab) => tab.isVisible(context));

export const getJournalTabIds = (context: JournalTabVisibilityContext) =>
  getJournalTabDefinitions(context).map((tab) => tab.id) as readonly JournalTab[];

export const resolveJournalTab = (raw: string | null | undefined, context: JournalTabVisibilityContext) =>
  normalizeTab(getJournalTabIds(context), JOURNAL_DEFAULT_TAB, raw);

export const buildJournalSearch = ({
  currentSearch,
  activeTab,
  selectedAccountId,
  portfolioUuid,
  canViewTradePlans,
}: {
  currentSearch: string;
  activeTab: string | null | undefined;
  selectedAccountId: string | null;
  portfolioUuid: string | null;
  canViewTradePlans: boolean;
}) => {
  const params = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch);
  params.set('tab', resolveJournalTab(activeTab, { canViewTradePlans }));

  if (!portfolioUuid) {
    if (selectedAccountId) {
      params.set('account_alias', selectedAccountId);
    } else {
      params.delete('account_alias');
    }
  }

  return params.toString();
};
