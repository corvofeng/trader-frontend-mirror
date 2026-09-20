import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { ArrowUpCircle, ArrowDownCircle, BarChart2, Check, X, Clock, Edit2, Save, ListFilter, ChevronDown, RefreshCw } from 'lucide-react';
import { authService, tradeService, stockConfigService } from '../../../lib/services';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { isBuyOperation, formatCurrency } from '../../../shared/utils';
import { StockChart } from './StockChart';
import type { Trade, StockConfig } from '../../../lib/services/types';
import toast from 'react-hot-toast';

interface TradeListProps {
  selectedStockCode?: string;
  theme: Theme;
  showCompleted?: boolean;
  selectedAccountId?: string | null;
}

const areTradesEquivalent = (left: Trade[], right: Trade[]) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  return left.every((trade, index) => {
    const candidate = right[index];
    return (
      trade.id === candidate?.id &&
      trade.updated_at === candidate?.updated_at &&
      trade.created_at === candidate?.created_at &&
      trade.status === candidate?.status &&
      trade.quantity === candidate?.quantity &&
      trade.target_price === candidate?.target_price
    );
  });
};

export function TradeList({ selectedStockCode, theme, showCompleted = false, selectedAccountId }: TradeListProps) {
  const { currencyConfig } = useCurrency();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [historyTradesByStock, setHistoryTradesByStock] = useState<Record<string, Trade[]>>({});
  const historyTradesHandlersRef = useRef<Record<string, (loadedTrades: Trade[]) => void>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>(showCompleted ? 'completed' : 'all');
  const [isUpdating, setIsUpdating] = useState<number | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editedNote, setEditedNote] = useState('');
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [expandedTrades, setExpandedTrades] = useState<number[]>([]);
  const [expandedStocks, setExpandedStocks] = useState<string[]>([]);
  const [stockConfigs, setStockConfigs] = useState<StockConfig[]>([]);

  const groupedTrades = useMemo(() => {
    const groups: Record<string, Trade[]> = {};
    trades.forEach(trade => {
      if (!groups[trade.stock_code]) {
        groups[trade.stock_code] = [];
      }
      groups[trade.stock_code].push(trade);
    });

    // Sort trades within groups by date descending
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    return Object.entries(groups).sort(([, tradesA], [, tradesB]) => {
      const latestA = tradesA[0]?.created_at ? new Date(tradesA[0].created_at).getTime() : 0;
      const latestB = tradesB[0]?.created_at ? new Date(tradesB[0].created_at).getTime() : 0;
      return latestB - latestA;
    });
  }, [trades]);

  const categoryGroups = useMemo(() => {
    if (stockConfigs.length === 0) {
      return [];
    }

    const stockCategoryMap = new Map<string, string>();
    stockConfigs.forEach(config => {
      stockCategoryMap.set(config.stock_code, config.category || 'Other');
    });

    const map = new Map<string, { category: string; stocks: [string, Trade[]][]; latestTimestamp: number }>();

    groupedTrades.forEach(([stockCode, stockTrades]) => {
      const category = stockCategoryMap.get(stockCode) || 'Other';
      let group = map.get(category);
      if (!group) {
        group = { category, stocks: [], latestTimestamp: 0 };
        map.set(category, group);
      }
      group.stocks.push([stockCode, stockTrades]);
      const latest = stockTrades[0]?.created_at ? new Date(stockTrades[0].created_at).getTime() : 0;
      if (latest > group.latestTimestamp) {
        group.latestTimestamp = latest;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  }, [groupedTrades, stockConfigs]);

  useEffect(() => {
    // Default to collapsed state (empty expandedStocks)
    setExpandedStocks([]);
  }, [trades]);

  useEffect(() => {
    const fetchStockConfigs = async () => {
      try {
        const { data, error } = await stockConfigService.getStockConfigs();
        if (error) {
          throw error;
        }
        if (data) {
          setStockConfigs(data);
        }
      } catch (error) {
        console.error('Failed to fetch stock configs for trades:', error);
        toast.error('Failed to load stock categories');
      }
    };

    fetchStockConfigs();
  }, []);

  const toggleStockExpansion = (stockCode: string) => {
    setExpandedStocks(prev => 
      prev.includes(stockCode)
        ? prev.filter(c => c !== stockCode)
        : [...prev, stockCode]
    );
  };

  const fetchTrades = useCallback(async () => {
    try {
      const authRes = await authService.getUser();
      const user = authRes.data?.user;
      
      if (user) {
        const { data } = await tradeService.getTrades(
          user.id, 
          showAllTrades ? undefined : selectedStockCode, 
          filter,
          selectedAccountId || undefined
        );
        if (data) setTrades(data);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast.error('Failed to load trades');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [showAllTrades, selectedStockCode, filter, selectedAccountId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTrades();
  };

  useEffect(() => {
    setIsLoading(true);
    fetchTrades();
  }, [fetchTrades, selectedAccountId]);

  useEffect(() => {
    setShowAllTrades(false);
  }, [selectedStockCode, selectedAccountId]);

  useEffect(() => {
    historyTradesHandlersRef.current = {};
    setHistoryTradesByStock({});
  }, [selectedAccountId]);

  const handleHistoryTradesLoaded = useCallback((stockCode: string, loadedTrades: Trade[]) => {
    setHistoryTradesByStock((prev) => {
      const currentTrades = prev[stockCode] || [];
      if (areTradesEquivalent(currentTrades, loadedTrades)) {
        return prev;
      }
      return { ...prev, [stockCode]: loadedTrades };
    });
  }, []);

  const getHistoryTradesHandler = useCallback((stockCode: string) => {
    const existing = historyTradesHandlersRef.current[stockCode];
    if (existing) return existing;

    const handler = (loadedTrades: Trade[]) => {
      handleHistoryTradesLoaded(stockCode, loadedTrades);
    };
    historyTradesHandlersRef.current[stockCode] = handler;
    return handler;
  }, [handleHistoryTradesLoaded]);

  const getStatusColor = (status: Trade['status']) => {
    switch (status) {
      case 'completed':
        return theme === 'dark' 
          ? 'bg-emerald-950/55 text-emerald-100 ring-1 ring-inset ring-emerald-400/15'
          : 'bg-green-100 text-green-800';
      case 'cancelled':
        return theme === 'dark'
          ? 'bg-rose-950/55 text-rose-100 ring-1 ring-inset ring-rose-400/15'
          : 'bg-red-100 text-red-800';
      default:
        return theme === 'dark'
          ? 'bg-amber-950/50 text-amber-100/90 ring-1 ring-inset ring-amber-400/15'
          : 'bg-yellow-100 text-yellow-800';
    }
  };

  const getOperationStyle = (operation: string) => {
    if (isBuyOperation(operation)) {
      return {
        icon: ArrowUpCircle,
        label: 'Buy',
        className: theme === 'dark' 
          ? 'bg-emerald-950/50 text-emerald-100 ring-1 ring-inset ring-emerald-400/15'
          : 'bg-green-100 text-green-600'
      };
    }
    return {
      icon: ArrowDownCircle,
      label: 'Sell',
      className: theme === 'dark' 
        ? 'bg-rose-950/50 text-rose-100 ring-1 ring-inset ring-rose-400/15'
        : 'bg-red-100 text-red-600'
    };
  };

  const renderTradeSummary = (pendingCount: number, completedCount: number, totalCount: number) => (
    <div className="grid w-full grid-cols-3 gap-2 text-center sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
      <div className={`rounded-md px-2 py-1.5 ${theme === 'dark' ? 'bg-amber-950/45 ring-1 ring-inset ring-amber-400/12' : 'bg-yellow-100'}`}>
        <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-amber-100/90' : 'text-yellow-800'}`}>{pendingCount}</div>
        <div className={`text-[10px] uppercase tracking-wide ${theme === 'dark' ? 'text-amber-100/65' : 'text-yellow-700/80'}`}>Pending</div>
      </div>
      <div className={`rounded-md px-2 py-1.5 ${theme === 'dark' ? 'bg-emerald-950/45 ring-1 ring-inset ring-emerald-400/12' : 'bg-green-100'}`}>
        <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-emerald-100' : 'text-green-800'}`}>{completedCount}</div>
        <div className={`text-[10px] uppercase tracking-wide ${theme === 'dark' ? 'text-emerald-100/65' : 'text-green-700/80'}`}>Completed</div>
      </div>
      <div className={`rounded-md px-2 py-1.5 ${theme === 'dark' ? 'bg-slate-800/80 ring-1 ring-inset ring-white/8' : 'bg-gray-100'}`}>
        <div className={`text-sm font-semibold ${themes[theme].text}`}>{totalCount}</div>
        <div className={`text-[10px] uppercase tracking-wide ${themes[theme].text} opacity-60`}>Total</div>
      </div>
    </div>
  );

  const handleStatusChange = async (tradeId: number, newStatus: Trade['status']) => {
    try {
      setIsUpdating(tradeId);
      const authRes = await authService.getUser();
      const user = authRes.data?.user;
      
      if (!user) {
        toast.error('Please sign in to update trades');
        return;
      }

      const trade = trades.find(t => t.id === tradeId);
      if (!trade) {
        toast.error('Trade not found');
        return;
      }

      const updatedTrade = { ...trade, status: newStatus };
      const { error } = await tradeService.updateTrade(updatedTrade);

      if (error) throw error;

      setTrades(trades.map(t => t.id === tradeId ? updatedTrade : t));
      toast.success(`Trade status updated to ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update trade status');
      console.error(error);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleEditNote = (trade: Trade) => {
    setEditingNoteId(trade.id);
    setEditedNote(trade.notes);
    if (!expandedTrades.includes(trade.id)) {
      setExpandedTrades([...expandedTrades, trade.id]);
    }
  };

  const handleSaveNote = async (tradeId: number) => {
    try {
      const authRes = await authService.getUser();
      const user = authRes.data?.user;
      
      if (!user) {
        toast.error('Please sign in to update notes');
        return;
      }

      const trade = trades.find(t => t.id === tradeId);
      if (!trade) {
        toast.error('Trade not found');
        return;
      }

      const updatedTrade = { ...trade, notes: editedNote };
      const { error } = await tradeService.updateTrade(updatedTrade);

      if (error) throw error;

      setTrades(trades.map(t => t.id === tradeId ? updatedTrade : t));
      setEditingNoteId(null);
      toast.success('Note updated successfully');
    } catch (error) {
      toast.error('Failed to update note');
      console.error(error);
    }
  };

  const toggleTradeExpansion = (tradeId: number) => {
    setExpandedTrades(prev => 
      prev.includes(tradeId)
        ? prev.filter(id => id !== tradeId)
        : [...prev, tradeId]
    );
  };

  const LoadingSkeleton = () => (
    <div className="animate-pulse space-y-4">
      {[...Array(3)].map((_, index) => (
        <div 
          key={index}
          className={`p-4 sm:p-6 ${themes[theme].background} rounded-lg`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600" />
              <div className="space-y-2">
                <div className="h-5 w-24 bg-gray-300 dark:bg-gray-600 rounded" />
                <div className="h-4 w-48 bg-gray-300 dark:bg-gray-600 rounded" />
              </div>
            </div>
            <div className="h-6 w-20 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );

  const StatusButtons = ({ trade }: { trade: Trade }) => {
    const isLoading = isUpdating === trade.id;
    
    if (trade.status === 'pending') {
      return (
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            onClick={() => handleStatusChange(trade.id, 'completed')}
            disabled={isLoading}
            className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded ${
              theme === 'dark'
                ? 'bg-emerald-950/55 text-emerald-100 ring-1 ring-inset ring-emerald-400/15 hover:bg-emerald-900/45'
                : 'bg-green-100 text-green-800 hover:bg-green-200'
            } transition-colors duration-150 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Check className="w-3 h-3 mr-1" />
            Complete
          </button>
          <button
            onClick={() => handleStatusChange(trade.id, 'cancelled')}
            disabled={isLoading}
            className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded ${
              theme === 'dark'
                ? 'bg-rose-950/55 text-rose-100 ring-1 ring-inset ring-rose-400/15 hover:bg-rose-900/45'
                : 'bg-red-100 text-red-800 hover:bg-red-200'
            } transition-colors duration-150 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <X className="w-3 h-3 mr-1" />
            Cancel
          </button>
        </div>
      );
    } else if (trade.status === 'completed' || trade.status === 'cancelled') {
      return (
        <div className="mt-2">
          <button
            onClick={() => handleStatusChange(trade.id, 'pending')}
            disabled={isLoading}
            className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded ${
              theme === 'dark'
                ? 'bg-amber-950/50 text-amber-100/90 ring-1 ring-inset ring-amber-400/15 hover:bg-amber-900/40'
                : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
            } transition-colors duration-150 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Clock className="w-3 h-3 mr-1" />
            Reset to Pending
          </button>
        </div>
      );
    }
    
    return null;
  };

  const animations = `
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-down {
      animation: slideDown 0.3s ease-out forwards;
    }
    .animate-fade-in {
      animation: fadeIn 0.4s ease-out forwards;
      opacity: 0;
    }
  `;

  const renderHistoryTradesTable = (historyTrades: Trade[]) => {
    if (historyTrades.length === 0) return null;

    return (
      <div className="px-4 pb-4">
        <h4 className={`text-sm font-semibold mb-3 ${themes[theme].text}`}>历史买卖记录</h4>
        <div className={`overflow-auto rounded-lg border ${themes[theme].border}`}>
          <table className="w-full text-sm">
            <thead className={`sticky top-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'} z-10 border-b ${themes[theme].border}`}>
              <tr className={`text-left text-xs uppercase tracking-wider ${themes[theme].text} opacity-70 font-medium`}>
                <th className="px-4 py-3 whitespace-nowrap">时间</th>
                <th className="px-4 py-3 whitespace-nowrap">操作</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">价格</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">数量</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">总额</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${themes[theme].border} ${themes[theme].text}`}>
              {historyTrades.map((trade) => {
                const isBuy = isBuyOperation(trade.operation);
                return (
                <tr 
                  key={trade.id}
                  className={`transition-colors ${
                    isBuy
                      ? 'bg-green-50/40 dark:bg-green-950/10 hover:bg-green-100/40 dark:hover:bg-green-950/25'
                      : 'bg-red-50/40 dark:bg-red-950/10 hover:bg-red-100/40 dark:hover:bg-red-950/25'
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap font-medium">
                    {format(new Date(trade.created_at), 'yyyy-MM-dd HH:mm')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      isBuy
                        ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                        : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                    }`}>
                      {isBuy ? '买入' : '卖出'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-mono">
                    {formatCurrency(trade.target_price, currencyConfig)}
                  </td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap font-mono font-medium ${
                    isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {isBuy ? '+' : '-'}{trade.quantity.toLocaleString()}
                  </td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap font-mono font-medium ${
                    isBuy ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {isBuy ? '-' : '+'}{formatCurrency(trade.target_price * trade.quantity, currencyConfig)}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden transition-colors duration-200`}>
      <style>{animations}</style>
      <div className={`px-4 sm:px-6 py-4 border-b ${themes[theme].border}`}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className={`text-lg sm:text-xl font-semibold ${themes[theme].text}`}>
              {showCompleted ? 'Completed Trades' : 'Trade Plans'}
              {selectedStockCode && !showAllTrades && ` - ${selectedStockCode}`}
            </h2>
            {selectedStockCode && (
              <button
                onClick={() => setShowAllTrades(!showAllTrades)}
                className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${themes[theme].secondary}`}
              >
                <ListFilter className="w-3 h-3 mr-1" />
                {showAllTrades ? 'Show Selected Stock' : 'Show All Trades'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${themes[theme].secondary} ${
                isRefreshing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className={`w-full sm:w-auto text-sm rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${themes[theme].input} ${themes[theme].text}`}
            >
              {!showCompleted ? (
                <>
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </>
              ) : (
                <>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>
      
      <div className={`divide-y ${themes[theme].border}`}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : trades.length === 0 ? (
          <div className="p-8 text-center">
            <div className={themes[theme].text}>
              <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">No trades found</p>
              <p className="text-sm opacity-75">
                {selectedStockCode && !showAllTrades
                  ? `No trades recorded for ${selectedStockCode}`
                  : showCompleted
                  ? 'No completed trades found'
                  : 'No trade plans have been created yet'}
              </p>
            </div>
          </div>
        ) : stockConfigs.length > 0 && categoryGroups.length > 0 ? (
          categoryGroups.map((group, groupIndex) => (
            <div key={group.category} className="py-4">
              <div className="px-6 pb-2">
                <h3 className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>
                  {group.category}
                </h3>
              </div>
              {group.stocks.map(([stockCode, stockTrades], index) => {
                const pendingCount = stockTrades.filter(t => t.status === 'pending').length;
                const completedCount = stockTrades.filter(t => t.status === 'completed').length;
                const historyTrades = historyTradesByStock[stockCode] || [];
                const isStockExpanded = expandedStocks.includes(stockCode);
                const stockName = stockTrades[0]?.stock_name || '';

                return (
                  <div 
                    key={stockCode} 
                    className={`mb-4 mx-4 rounded-lg border ${themes[theme].border} overflow-hidden shadow-sm animate-fade-in`}
                    style={{ animationDelay: `${(groupIndex * 0.05) + (index * 0.05)}s` }}
                  >
                    <div 
                      className={`px-4 py-3 flex items-start justify-between gap-3 cursor-pointer ${
                        theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
                      } transition-all duration-200 hover:shadow-md`}
                      onClick={() => toggleStockExpansion(stockCode)}
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>
                          {stockName} <span className="text-sm font-normal opacity-75">({stockCode})</span>
                        </h3>
                        <div className="mt-3">
                          {renderTradeSummary(pendingCount, completedCount, stockTrades.length)}
                        </div>
                      </div>
                      <ChevronDown 
                        className={`mt-1 h-5 w-5 shrink-0 ${themes[theme].text} opacity-75 transition-transform duration-300 ${isStockExpanded ? 'rotate-180' : ''}`} 
                      />
                    </div>

                    {isStockExpanded && (
                      <div className={`divide-y ${themes[theme].border} border-top ${themes[theme].border} animate-slide-down`}>
                        <div className="p-4">
                          <StockChart 
                            stockCode={stockCode} 
                            theme={theme} 
                            pendingTrades={stockTrades.filter(t => t.status === 'pending')}
                            accountId={selectedAccountId}
                            onTradesLoaded={getHistoryTradesHandler(stockCode)}
                          />
                        </div>
                        {renderHistoryTradesTable(historyTrades)}
                        {stockTrades.map((trade) => {
                          const isExpanded = expandedTrades.includes(trade.id);
                          const operationStyle = getOperationStyle(trade.operation);
                          const OperationIcon = operationStyle.icon;
                          
                          return (
                            <div 
                              key={trade.id} 
                              className={`p-4 sm:p-6 ${themes[theme].cardHover} transition duration-150`}
                            >
                              <div 
                                className="flex items-start justify-between cursor-pointer"
                                onClick={() => toggleTradeExpansion(trade.id)}
                              >
                                <div className="flex items-start space-x-3">
                                  <div className={`p-2 rounded-full ${operationStyle.className}`}>
                                    <OperationIcon className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-baseline gap-2">
                                      <h3 className={`text-base sm:text-lg font-medium ${themes[theme].text}`}>
                                        {trade.stock_code}
                                      </h3>
                                      <span className={`text-sm ${themes[theme].text} opacity-75`}>
                                        {trade.stock_name}
                                      </span>
                                    </div>
                                    <div className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                                      <span className="font-medium">{operationStyle.label}</span> at {formatCurrency(trade.target_price, currencyConfig)} × {trade.quantity}
                                    </div>
                                    <div className={`flex flex-col text-sm ${themes[theme].text} opacity-75 mt-0.5`}>
                                      <span>Created: {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}</span>
                                      {trade.updated_at && trade.updated_at !== trade.created_at && (
                                        <span>Updated: {format(new Date(trade.updated_at), 'MMM d, yyyy HH:mm')}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    getStatusColor(trade.status)
                                  }`}>
                                    {trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
                                  </span>
                                  <ChevronDown className={`w-5 h-5 ml-2 ${themes[theme].text} transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="mt-4 space-y-3 animate-slide-down">
                                  <div className={`p-3 rounded-md ${themes[theme].background}`}>
                                    {editingNoteId === trade.id ? (
                                      <div className="flex flex-col space-y-2">
                                        <textarea
                                          value={editedNote}
                                          onChange={(e) => setEditedNote(e.target.value)}
                                          className={`w-full p-3 rounded-md ${themes[theme].input} ${themes[theme].text} focus:ring-2 focus:ring-blue-500`}
                                          rows={3}
                                        />
                                        <div className="flex justify-end space-x-2">
                                          <button
                                            onClick={() => setEditingNoteId(null)}
                                            className={`px-3 py-1.5 rounded-md text-sm ${themes[theme].secondary}`}
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={() => handleSaveNote(trade.id)}
                                            className={`px-3 py-1.5 rounded-md text-sm ${themes[theme].primary} inline-flex items-center`}
                                          >
                                            <Save className="w-4 h-4 mr-1" />
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="group relative">
                                        <div className={`text-sm ${themes[theme].text} opacity-90 pr-10`}>
                                          {trade.notes || 'No notes added'}
                                        </div>
                                        {trade.status !== 'pending' && (
                                          <div className={`text-xs ${themes[theme].text} opacity-75 mt-2`}>
                                            {trade.status === 'completed' ? 'Completed' : 'Cancelled'} on {format(new Date(trade.updated_at || trade.created_at), 'MMM d, yyyy HH:mm')}
                                          </div>
                                        )}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditNote(trade);
                                          }}
                                          className={`absolute top-0 right-0 p-1.5 rounded-md ${themes[theme].secondary}`}
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <StatusButtons trade={trade} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          groupedTrades.map(([stockCode, stockTrades], index) => {
            const pendingCount = stockTrades.filter(t => t.status === 'pending').length;
            const completedCount = stockTrades.filter(t => t.status === 'completed').length;
            const historyTrades = historyTradesByStock[stockCode] || [];
            const isStockExpanded = expandedStocks.includes(stockCode);
            const stockName = stockTrades[0]?.stock_name || '';
            
            return (
              <div 
                key={stockCode} 
                className={`mb-4 mx-4 rounded-lg border ${themes[theme].border} overflow-hidden shadow-sm animate-fade-in`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div 
                  className={`px-4 py-3 flex items-start justify-between gap-3 cursor-pointer ${
                    theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
                  } transition-all duration-200 hover:shadow-md`}
                  onClick={() => toggleStockExpansion(stockCode)}
                >
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-base sm:text-lg font-semibold ${themes[theme].text}`}>
                      {stockName} <span className="text-sm font-normal opacity-75">({stockCode})</span>
                    </h3>
                    <div className="mt-3">
                      {renderTradeSummary(pendingCount, completedCount, stockTrades.length)}
                    </div>
                  </div>
                  <ChevronDown 
                    className={`mt-1 h-5 w-5 shrink-0 ${themes[theme].text} opacity-75 transition-transform duration-300 ${isStockExpanded ? 'rotate-180' : ''}`} 
                  />
                </div>

                {isStockExpanded && (
                  <div className={`divide-y ${themes[theme].border} border-t ${themes[theme].border} animate-slide-down`}>
                    <div className="p-4">
                      <StockChart 
                        stockCode={stockCode} 
                        theme={theme} 
                        pendingTrades={stockTrades.filter(t => t.status === 'pending')}
                        accountId={selectedAccountId}
                        onTradesLoaded={getHistoryTradesHandler(stockCode)}
                      />
                    </div>
                    {renderHistoryTradesTable(historyTrades)}
                    {stockTrades.map((trade) => {
                      const isExpanded = expandedTrades.includes(trade.id);
                      const operationStyle = getOperationStyle(trade.operation);
                      const OperationIcon = operationStyle.icon;
                      
                      return (
                        <div 
                          key={trade.id} 
                          className={`p-4 sm:p-6 ${themes[theme].cardHover} transition duration-150`}
                        >
                          <div 
                            className="flex items-start justify-between cursor-pointer"
                            onClick={() => toggleTradeExpansion(trade.id)}
                          >
                            <div className="flex items-start space-x-3">
                              <div className={`p-2 rounded-full ${operationStyle.className}`}>
                                <OperationIcon className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-baseline gap-2">
                                  <h3 className={`text-base sm:text-lg font-medium ${themes[theme].text}`}>
                                    {trade.stock_code}
                                  </h3>
                                  <span className={`text-sm ${themes[theme].text} opacity-75`}>
                                    {trade.stock_name}
                                  </span>
                                </div>
                                <div className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                                  <span className="font-medium">{operationStyle.label}</span> at {formatCurrency(trade.target_price, currencyConfig)} × {trade.quantity}
                                </div>
                                <div className={`flex flex-col text-sm ${themes[theme].text} opacity-75 mt-0.5`}>
                                  <span>Created: {format(new Date(trade.created_at), 'MMM d, yyyy HH:mm')}</span>
                                  {trade.updated_at && trade.updated_at !== trade.created_at && (
                                    <span>Updated: {format(new Date(trade.updated_at), 'MMM d, yyyy HH:mm')}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                getStatusColor(trade.status)
                              }`}>
                                {trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
                              </span>
                              <ChevronDown className={`w-5 h-5 ml-2 ${themes[theme].text} transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 space-y-3 animate-slide-down">
                              <div className={`p-3 rounded-md ${themes[theme].background}`}>
                                {editingNoteId === trade.id ? (
                                  <div className="flex flex-col space-y-2">
                                    <textarea
                                      value={editedNote}
                                      onChange={(e) => setEditedNote(e.target.value)}
                                      className={`w-full p-3 rounded-md ${themes[theme].input} ${themes[theme].text} focus:ring-2 focus:ring-blue-500`}
                                      rows={3}
                                    />
                                    <div className="flex justify-end space-x-2">
                                      <button
                                        onClick={() => setEditingNoteId(null)}
                                        className={`px-3 py-1.5 rounded-md text-sm ${themes[theme].secondary}`}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={() => handleSaveNote(trade.id)}
                                        className={`px-3 py-1.5 rounded-md text-sm ${themes[theme].primary} inline-flex items-center`}
                                      >
                                        <Save className="w-4 h-4 mr-1" />
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="group relative">
                                    <div className={`text-sm ${themes[theme].text} opacity-90 pr-10`}>
                                      {trade.notes || 'No notes added'}
                                    </div>
                                    {trade.status !== 'pending' && (
                                      <div className={`text-xs ${themes[theme].text} opacity-75 mt-2`}>
                                        {trade.status === 'completed' ? 'Completed' : 'Cancelled'} on {format(new Date(trade.updated_at || trade.created_at), 'MMM d, yyyy HH:mm')}
                                      </div>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditNote(trade);
                                      }}
                                      className={`absolute top-0 right-0 p-1.5 rounded-md ${themes[theme].secondary}`}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <StatusButtons trade={trade} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
