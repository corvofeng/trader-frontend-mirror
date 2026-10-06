import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { logger } from '../../../shared/utils/logger';
import { Filter, ExternalLink, X, Download, Activity } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { Account, Holding, PortfolioKlineMetrics, PortfolioKlinePoint, Trade, TrendData, User } from '../../../lib/services/types';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import type { LegendItem, TooltipItem } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { portfolioService, accountService, isCloudflareEnv } from '../../../lib/services';
import { checkIsMainAccount } from '../../../shared/utils/accountSelection';
import { PortfolioTrend } from './PortfolioTrend';
import { PortfolioHeatmap } from './PortfolioHeatmap';
import { StockAnalysisModal } from './StockAnalysisModal';
import { PortfolioAnalysisPanel } from './PortfolioAnalysisPanel';
import { toPng } from 'html-to-image';
import { ScreenshotPreview } from './ScreenshotPreview';
import { HoldingsTable } from './HoldingsTable';
import { TradesTable } from './TradesTable';
import { OverviewControls } from './OverviewControls';
import { PortfolioHeader } from './PortfolioHeader';
import { StatsGrid } from './StatsGrid';
import { FadeIn } from '../../../shared/components/FadeIn';
import {
  calculatePortfolioSummary,
  resolvePortfolioKlineRequestDates,
  sortPortfolioHoldings,
  sortPortfolioTrades,
} from './portfolioUtils';

ChartJS.register(
  ArcElement, 
  Tooltip, 
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement
);

interface PortfolioProps {
  holdings: Holding[];
  theme: Theme;
  recentTrades?: Trade[];
  isLoading?: boolean;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isSharedView?: boolean;
  userId?: string;
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string) => void;
  isSnapshot?: boolean;
  user?: User | null;
  isMainAccount?: boolean;
}

export function Portfolio({ 
  holdings, 
  theme, 
  recentTrades = [], 
  isLoading = false,
  dateRange, 
  onDateRangeChange,
  isSharedView = false,
  userId,
  selectedAccountId,
  onAccountChange,
  isSnapshot = false,
  user,
  isMainAccount: isMainAccountProp,
}: PortfolioProps) {
  const [showRecentTrades, setShowRecentTrades] = useState(true);
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [holdingsPerPage, setHoldingsPerPage] = useState(5);
  const [holdingsSort, setHoldingsSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'total_value', direction: 'desc' });
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPerPage, setTradesPerPage] = useState(5);
  const [tradesSort, setTradesSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'created_at', direction: 'desc' });
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [klineData, setKlineData] = useState<PortfolioKlinePoint[]>([]);
  const [klineMetrics, setKlineMetrics] = useState<PortfolioKlineMetrics | null>(null);
  const [selectedStockForAnalysis, setSelectedStockForAnalysis] = useState<{ code: string; name: string } | null>(null);
  const [showPortfolioAnalysis, setShowPortfolioAnalysis] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const journalRef = useRef<HTMLDivElement>(null);
  const { currencyConfig } = useCurrency();
  const [, setIsRefreshing] = useState(false);

  const [internalAccounts, setInternalAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (isMainAccountProp !== undefined) return;
    let cancelled = false;
    accountService.getAccounts(userId || 'mock-user-id').then((res) => {
      if (!cancelled && res.data) {
        setInternalAccounts(res.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isMainAccountProp, userId]);

  const effectiveIsMainAccount = useMemo(() => {
    if (isMainAccountProp !== undefined) return isMainAccountProp;
    return checkIsMainAccount({
      selectedAccountId,
      accounts: internalAccounts,
    });
  }, [isMainAccountProp, selectedAccountId, internalAccounts]);
  
  // Calculate portfolio metrics
  const {
    totalHoldingsValue,
    totalProfitLoss,
    latestTrendValue,
    positionRatio,
    remainingCash,
  } = calculatePortfolioSummary(holdings, trendData);

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(window.location.search).get('uuid');

  useEffect(() => {
    let cancelled = false;
    const fetchTrendData = async () => {
      try {
        const {
          shouldUseAssetKlineDefaultRange,
          klineStartDate,
          klineEndDate,
          metricsEndDate,
        } = resolvePortfolioKlineRequestDates(dateRange, window.location.search);

        let trendPromise: Promise<Awaited<ReturnType<typeof portfolioService.getTrendData>> | Awaited<ReturnType<typeof portfolioService.getTrendDataByUuid>>> | null = null;
        let klinePromise: Promise<Awaited<ReturnType<typeof portfolioService.getKlineData>> | Awaited<ReturnType<typeof portfolioService.getKlineDataByUuid>>> | null = null;
        let klineMetricsPromise: Promise<Awaited<ReturnType<typeof portfolioService.getMetrics>> | Awaited<ReturnType<typeof portfolioService.getMetricsByUuid>>> | null = null;
        if (portfolioUuid) {
          trendPromise = portfolioService.getTrendDataByUuid(
            portfolioUuid,
            dateRange.startDate,
            dateRange.endDate
          );
          klinePromise = portfolioService.getKlineDataByUuid(
            portfolioUuid,
            klineStartDate,
            shouldUseAssetKlineDefaultRange ? klineEndDate : dateRange.endDate,
          );
          klineMetricsPromise = portfolioService.getMetricsByUuid(
            portfolioUuid,
            metricsEndDate,
          );
        } else if (!isSharedView) {
          // Fix null handling for accountId when calling services
    if (!userId || !selectedAccountId) {
      logger.debug('[Portfolio] Guard: user/account missing', { userId, selectedAccountId });
      return;
    }

          trendPromise = portfolioService.getTrendData(
            userId,
            dateRange.startDate,
            dateRange.endDate,
            selectedAccountId,
          );
          klinePromise = portfolioService.getKlineData(
            userId,
            klineStartDate,
            shouldUseAssetKlineDefaultRange ? klineEndDate : dateRange.endDate,
            selectedAccountId,
          );
          klineMetricsPromise = portfolioService.getMetrics(
            userId,
            metricsEndDate,
            selectedAccountId,
          );
        }

        if (!trendPromise || !klinePromise || !klineMetricsPromise) return;

        const [trendResponse, klineResponse, klineMetricsResponse] = await Promise.allSettled([
          trendPromise,
          klinePromise,
          klineMetricsPromise,
        ]);
        if (cancelled) return;

        if (trendResponse.status === 'fulfilled' && trendResponse.value?.data) {
          setTrendData(trendResponse.value.data);
        }
        if (klineResponse.status === 'fulfilled') {
          setKlineData(klineResponse.value?.data || []);
        } else {
          setKlineData([]);
        }

        if (klineMetricsResponse.status === 'fulfilled') {
          setKlineMetrics(klineMetricsResponse.value?.data ?? null);
        } else {
          setKlineMetrics(null);
        }
      } catch (error) {
        console.error('Error fetching trend data:', error);
      }
    };

    fetchTrendData();
    return () => {
      cancelled = true;
    };
  }, [dateRange, isSharedView, portfolioUuid, selectedAccountId, userId]);

  const refreshAll = async () => {
    if (isSharedView) return;
    if (!userId || !selectedAccountId) {
      logger.debug('[Portfolio] Guard: cannot refresh without user/account');
      return;
    }
    setIsRefreshing(true);
    const toastId = toast.loading('正在刷新资产数据...');
    try {
      const [, , trendResp] = await Promise.all([
        portfolioService.getHoldings(userId, selectedAccountId),
        portfolioService.getRecentTrades(userId, dateRange.startDate, dateRange.endDate, selectedAccountId),
        portfolioService.getTrendData(userId, dateRange.startDate, dateRange.endDate, selectedAccountId),
      ]);
      // 更新父传入的持仓/交易需由上层触发，这里只触发日期范围以促使父刷新
      if (trendResp?.data) setTrendData(trendResp.data);
      // 轻微抖动日期，触发父层useEffect刷新持仓/交易
      onDateRangeChange({ ...dateRange });
      toast.success('资产数据已成功刷新！', { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error('刷新资产数据失败', { id: toastId });
    } finally {
      setIsRefreshing(false);
    }
  };


  const sortedHoldings = sortPortfolioHoldings(holdings, holdingsSort);
  const sortedTrades = sortPortfolioTrades(recentTrades, tradesSort);

  const paginatedHoldings = sortedHoldings.slice(
    (holdingsPage - 1) * holdingsPerPage,
    holdingsPage * holdingsPerPage
  );
  
  const paginatedTrades = sortedTrades.slice(
    (tradesPage - 1) * tradesPerPage,
    tradesPage * tradesPerPage
  );

  const totalHoldingsPages = Math.ceil(holdings.length / holdingsPerPage);
  const totalTradesPages = Math.ceil(recentTrades.length / tradesPerPage);

  const sortedHoldingsForPie = [...holdings].sort((a, b) => b.total_value - a.total_value);

  const pieChartData = {
    labels: sortedHoldingsForPie.map(h => h.stock_name),
    datasets: [
      {
        data: sortedHoldingsForPie.map(h => h.total_value),
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
          'rgba(255, 159, 64, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(255, 206, 86, 0.8)',
        ],
        borderColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
      },
    ],
  };

  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // iPhone 14 尺寸: 390x844, 更精确的移动端判断
  const isMobile = screenSize.width < 640;

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { 
      padding: isMobile ? 0 : { 
        top: 8, 
        right: 8, 
        bottom: 16, 
        left: 8 
      } 
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827',
          font: { size: 11 },
          boxWidth: 12,
          padding: 16,
          usePointStyle: false,
          filter: (legendItem: LegendItem) => {
            // Only show legend for the top 5 holdings
            return (legendItem.index ?? 0) < 5;
          }
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: TooltipItem<'pie'>) {
            const label = context.label || '';
            const value = typeof context.parsed === 'number' ? context.parsed : 0;
            const data = context.dataset.data as number[];
            const total = data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${label}: ${formatCurrency(value, currencyConfig)} (${percentage}%)`;
          }
        }
      }
    }
  };

  const handleHoldingsSort = (field: string) => {
    setHoldingsSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleTradesSort = (field: string) => {
    if (field !== 'created_at') return;
    setTradesSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleScreenshot = async () => {
    if (!journalRef.current) {
      logger.debug('[Portfolio] Guard: journalRef missing');
      return;
    }
    
    try {
      const node = journalRef.current;
      
      // 获取当前主题的背景色
      const getBackgroundColor = (t: Theme) => {
        switch (t) {
          case 'dark': return '#111827'; // gray-900
          case 'blue': return '#eff6ff'; // blue-50
          case 'light':
          default: return '#f3f4f6'; // gray-100
        }
      };

      // Use the rendered box width instead of scrollWidth so hidden overflow
      // does not create extra whitespace on the right side of the screenshot.
      const rect = node.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(Math.max(node.scrollHeight, rect.height));

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 4, // 进一步提高分辨率以对抗压缩
        quality: 1.0,
        width: width,
        height: height,
        style: {
          backgroundColor: getBackgroundColor(theme),
          boxSizing: 'border-box',
          width: `${width}px`,
          height: `${height}px`,
          margin: '0',
          overflow: 'hidden',
        },
      });
      
      setScreenshotPreview(dataUrl);
      setShowPreview(true);
    } catch (error) {
      console.error('Error generating screenshot:', error);
    }
  };

  const handleSaveScreenshot = () => {
  if (!screenshotPreview) {
    logger.debug('[Portfolio] Guard: screenshotPreview missing');
    return;
  }
    
    const link = document.createElement('a');
    link.download = `trading-journal-${new Date().toISOString().split('T')[0]}.png`;
    link.href = screenshotPreview;
    link.click();
    
    setShowPreview(false);
    setScreenshotPreview(null);
  };

  const handleScreenshotSave = async () => {
  if (!imageUrl) {
    logger.debug('[Portfolio] Guard: imageUrl missing');
    return;
  }

    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `portfolio_screenshot_${new Date().toISOString().split('T')[0]}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  return (
    <div className="space-y-6 printable-content" ref={journalRef}>
      {isSnapshot && (
        <div className={`p-4 mb-4 ${themes[theme].semantic.snapshotBanner}`}>
          <div className="flex">
            <div className="flex-shrink-0">
              <Activity className={`h-5 w-5 ${themes[theme].semantic.snapshotIcon}`} aria-hidden="true" />
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className={`text-sm sm:whitespace-nowrap ${themes[theme].semantic.snapshotText}`}>
                当前显示的数据为快照数据，可能与实时市场状态存在延迟。
              </p>
            </div>
          </div>
        </div>
      )}
      {isSharedView && (
        <div className={`${themes[theme].card} rounded-lg p-4 border-l-4 border-blue-500`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ExternalLink className="w-5 h-5 text-blue-500" />
              <span className={`text-sm font-medium ${themes[theme].text}`}>
                This is a shared portfolio view
              </span>
            </div>
            <span className={`text-xs ${themes[theme].text} opacity-60`}>
              Read-only access
            </span>
          </div>
        </div>
      )}

      {/* Portfolio Analysis Panel moved to bottom */}

      {/* Stock Analysis Modal */}
      {!isCloudflareEnv && selectedStockForAnalysis && (
        <div className="no-print">
          <StockAnalysisModal
            stockCode={selectedStockForAnalysis.code}
            stockName={selectedStockForAnalysis.name}
            theme={theme}
            userId={userId}
            accountId={selectedAccountId}
            onClose={() => setSelectedStockForAnalysis(null)}
          />
        </div>
      )}
      <div className={`${themes[theme].card} rounded-lg shadow-md p-3 md:p-6 relative z-10`}>
        <div className="no-print">
          <OverviewControls
            theme={theme}
            userId={userId}
            selectedAccountId={selectedAccountId ?? null}
            onAccountChange={onAccountChange}
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
            isSharedView={isSharedView}
            portfolioUuid={portfolioUuid}
            onRefresh={refreshAll}
            isLoggedIn={!!user}
            onScreenshot={handleScreenshot}
          />
        </div>
        <FadeIn delay={100}>
          <StatsGrid
            theme={theme}
            currencyConfig={currencyConfig}
            latestTrendValue={latestTrendValue}
            totalHoldingsValue={totalHoldingsValue}
            positionRatio={positionRatio}
            totalProfitLoss={totalProfitLoss}
            remainingCash={remainingCash}
            hasTrendData={trendData.length > 0}
          />
        </FadeIn>
      </div>

      {trendData.length > 0 && (
        <FadeIn delay={200}>
          <div className={`${themes[theme].card} rounded-lg shadow-md`}>
            <PortfolioTrend 
              trendData={trendData}
              klineData={klineData}
              klineMetrics={klineMetrics}
              theme={theme}
              dateRange={dateRange}
            />
          </div>
        </FadeIn>
      )}

      <div className="mt-6">
        {isLoading && holdings.length === 0 ? (
          <div className={`${themes[theme].card} rounded-lg shadow-md`}>
            <div className="p-4 sm:p-6">
              <div className="h-[400px] sm:h-[600px] rounded-md bg-gray-200/60 dark:bg-gray-800/60 animate-pulse" />
            </div>
          </div>
        ) : (
          <PortfolioHeatmap holdings={holdings} theme={theme} />
        )}
      </div>

      <div className={`${themes[theme].card} rounded-lg shadow-md p-4 md:p-6 mt-6`}>
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="order-1 lg:order-1 min-w-0">
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
              onAnalyzeStock={isCloudflareEnv ? undefined : (code, name) => setSelectedStockForAnalysis({ code, name })}
              isLoading={isLoading}
            />
          </div>

          <div className="order-2 lg:order-2 min-w-0">
            <div className="h-[180px] xs:h-[220px] sm:h-[320px] md:h-[360px] lg:h-[450px] relative mx-auto">
              <Pie data={pieChartData} options={pieChartOptions} />
            </div>
          </div>
        </div>
      </div>

      {recentTrades.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-sm sm:shadow-md overflow-hidden transition-colors duration-200`}>
          <div className={`p-3 sm:p-6 border-b ${themes[theme].border}`}>
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <div className="flex items-center gap-3">
                <h2 className={`text-lg font-semibold ${themes[theme].text} whitespace-nowrap`}>成交记录</h2>
                {!isSharedView && effectiveIsMainAccount && (
                  <div className="flex items-center gap-2">
                    <a
                      href="https://t.me/YHTraderNotice"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="在 Telegram 频道接收主账户实时交易成交通知"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#0088cc]/10 text-[#0088cc] dark:bg-[#0088cc]/15 dark:text-[#50b6ff] ring-1 ring-[#0088cc]/30 hover:bg-[#0088cc]/20 dark:hover:bg-[#0088cc]/25 transition-all duration-200"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.578.192l-8.533 7.701-.33 4.955c.488 0 .702-.223.974-.488l2.338-2.275 4.866 3.59c.898.496 1.543.241 1.767-.83l3.193-15.04c.328-1.312-.5-1.907-1.357-1.522z" />
                      </svg>
                      <span className="hidden sm:inline">Telegram 订阅 (主账户)</span>
                      <span className="sm:hidden">Telegram 订阅</span>
                    </a>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={tradesPerPage}
                  onChange={(e) => setTradesPerPage(Number(e.target.value))}
                  className={`flex-1 sm:flex-none px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
                >
                  <option value={5}>每页 5 条</option>
                  <option value={10}>每页 10 条</option>
                  <option value={20}>每页 20 条</option>
                </select>
                <button
                  onClick={() => setShowRecentTrades(!showRecentTrades)}
                  className={`p-2 rounded-md ${themes[theme].secondary}`}
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          
          {showRecentTrades && (
            <div className="p-3 sm:p-4">
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
                showHeader={false}
                onAnalyzeStock={isCloudflareEnv ? undefined : (code, name) => setSelectedStockForAnalysis({ code, name })}
              />
            </div>
          )}
        </div>
      )}

      {/* Portfolio Analysis Panel (bottom) */}
      <div className="mt-6">
        <PortfolioHeader
          theme={theme}
          showPortfolioAnalysis={showPortfolioAnalysis}
          onToggle={() => setShowPortfolioAnalysis(!showPortfolioAnalysis)}
        />
        {showPortfolioAnalysis && (
          <PortfolioAnalysisPanel
            theme={theme}
            portfolioUuid={portfolioUuid || undefined}
            userId={userId}
            selectedAccountId={selectedAccountId ?? null}
          />
        )}
      </div>

      {/* Screenshot Preview Modal */}
      {imageUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className={`${themes[theme].card} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col`}>
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
                持仓预览
              </h2>
              <button
                onClick={() => setImageUrl(null)}
                className={`p-2 rounded-md ${themes[theme].secondary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-auto">
              <div className={`${themes[theme].background} rounded-lg p-2 flex justify-center`}>
                <img 
                  src={imageUrl} 
                  alt="持仓数据截图" 
                  className="max-w-full h-auto rounded shadow-lg"
                />
              </div>
            </div>
            
            <div className="p-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setImageUrl(null)}
                className={`px-4 py-2 rounded-md ${themes[theme].secondary}`}
              >
                取消
              </button>
              <button
                onClick={handleScreenshotSave}
                className={`px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2`}
              >
                <Download className="w-4 h-4" />
                保存图片
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Journal Screenshot Preview */}
      {showPreview && (
        <ScreenshotPreview
          imageUrl={screenshotPreview}
          theme={theme}
          onClose={() => {
            setShowPreview(false);
            setScreenshotPreview(null);
          }}
          onSave={handleSaveScreenshot}
          contentRef={journalRef}
        />
      )}
    </div>
  );
}
