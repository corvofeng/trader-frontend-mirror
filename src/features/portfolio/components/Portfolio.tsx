import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { logger } from '../../../shared/utils/logger';
import { Filter, ExternalLink, Bell, BellOff, RefreshCw, AlertCircle } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { Holding, PortfolioKlineMetrics, PortfolioKlinePoint, Trade, TrendData, User } from '../../../lib/services/types';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import type { LegendItem, TooltipItem } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { portfolioService } from '../../../lib/services';
import { PortfolioTrend } from './PortfolioTrend';
import { PortfolioHeatmap } from './PortfolioHeatmap';
import { StockAnalysisModal } from './StockAnalysisModal';
import { PortfolioAnalysisPanel } from './PortfolioAnalysisPanel';
import { X, Download, Activity, Wrench } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ScreenshotPreview } from './ScreenshotPreview';
import { HoldingsTable } from './HoldingsTable';
import { TradesTable } from './TradesTable';
import { OverviewControls } from './OverviewControls';
import { PortfolioHeader } from './PortfolioHeader';
import { StatsGrid } from './StatsGrid';
import { FadeIn } from '../../../shared/components/FadeIn';
import { useTradeNotifications } from '../hooks/useTradeNotifications';
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
  const [showPushDebugModal, setShowPushDebugModal] = useState(false);
  const journalRef = useRef<HTMLDivElement>(null);
  const { currencyConfig } = useCurrency();
  const [, setIsRefreshing] = useState(false);

  const notifications = useTradeNotifications({
    accountAlias: !isSharedView ? selectedAccountId : undefined,
  });
  
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
      {selectedStockForAnalysis && (
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
      <div className={`${themes[theme].card} rounded-lg shadow-md p-3 md:p-6`}>
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
              onAnalyzeStock={(code, name) => setSelectedStockForAnalysis({ code, name })}
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
                {!isSharedView && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
                        const isIos = /iPad|iPhone|iPod/i.test(ua) ||
                          (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
                        const standalone =
                          (typeof navigator !== 'undefined' &&
                            (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
                          (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true);
                        const isIosNeedsPwa = isIos && !standalone &&
                          (notifications.permission === 'unsupported' || notifications.permission === 'denied');

                        if (isIosNeedsPwa) {
                          toast(
                            (t) => (
                              <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow-lg rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-700 p-4 text-xs text-zinc-800 dark:text-zinc-200 border-l-4 border-sky-500">
                                <div className="font-semibold text-sm mb-3 text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                                  iOS 需安装为 PWA 才能收到推送
                                </div>
                                <div className="mb-2 opacity-80">
                                  你现在是在 Safari 普通标签页，iOS 的 Web Push 通知<strong className="font-semibold">必须作为主屏 App</strong> 才能开启。
                                </div>
                                <ol className="space-y-2 mb-3 pl-1 opacity-95">
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-sky-500 font-semibold">①</span>
                                    <span>点 Safari 底部的<strong className="font-semibold">⇪ 分享按钮</strong>（方框+向上箭头）</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-sky-500 font-semibold">②</span>
                                    <span>下滑找到<strong className="font-semibold">「添加到主屏幕」</strong>，右上角点「添加」</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-sky-500 font-semibold">③</span>
                                    <span><strong className="font-semibold">回到桌面，点击刚添加的 App 图标</strong> 重新打开</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-emerald-500 font-semibold">④</span>
                                    <span>再次点「订阅 PWA Push」→ 允许通知 ✅</span>
                                  </li>
                                </ol>
                                <div className="text-[11px] opacity-70 mb-3">
                                  ❌ <strong className="font-semibold">不支持 Chrome / Firefox / Edge for iOS</strong>，它们都是 WebKit 外壳，都没有 Web Push 权限。
                                </div>
                                <div className="flex gap-2">
                                  <a
                                    href="https://web.dev/learn/pwa/installation?hl=zh-cn"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20 inline-flex items-center gap-1"
                                  >web.dev 教程
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
                                  </a>
                                  <button
                                    onClick={() => toast.dismiss(t.id)}
                                    className="ml-auto px-2.5 py-1 rounded-md text-[11px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                  >知道了</button>
                                </div>
                              </div>
                            ),
                            { duration: 120_000 }
                          );
                          return;
                        }
                        if (notifications.enabled) {
                          if (window.confirm('确认要取消 PWA 消息推送订阅吗？\n取消后，您将无法在后台或关闭页面时收到新成交通知。')) {
                            void notifications.toggleEnabled();
                          }
                        } else {
                          void notifications.toggleEnabled();
                        }
                      }}
                      title={
                        notifications.enabled
                          ? '取消 PWA Web Push 订阅'
                          : notifications.permission === 'denied'
                          ? '通知权限被拒绝，点击查看如何解决（iOS 需添加到主屏幕）'
                          : notifications.permission === 'unsupported'
                          ? '当前环境不支持 Web Push（iOS 需添加到主屏幕，点击查看步骤）'
                          : '订阅 PWA Web Push（关闭页面也能收到新成交通知）'
                      }
                      className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                        notifications.enabled
                          ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 ring-1 ring-violet-500/30 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/20 dark:hover:text-red-300 hover:ring-red-500/30'
                          : notifications.permission === 'denied'
                          ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300 ring-1 ring-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20'
                          : notifications.permission === 'unsupported'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 ring-1 ring-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20'
                          : `${themes[theme].secondary} ${themes[theme].text} opacity-90 hover:opacity-100`
                      }`}
                    >
                      {notifications.enabled ? (
                        <>
                          {notifications.pushSubscribed ? (
                            <>
                              <Bell className="w-3.5 h-3.5 group-hover:hidden" />
                              <BellOff className="w-3.5 h-3.5 hidden group-hover:inline" />
                              <span className="hidden sm:inline">
                                <span className="group-hover:hidden">已订阅 PWA</span>
                                <span className="hidden group-hover:inline">取消 PWA 订阅</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <Bell className="w-3.5 h-3.5 animate-pulse" />
                              <span className="hidden sm:inline">订阅中…</span>
                            </>
                          )}
                        </>
                      ) : notifications.permission === 'denied' ? (
                        <>
                          <BellOff className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">权限被拒 · 点击解决</span>
                        </>
                      ) : notifications.permission === 'unsupported' ? (
                        <>
                          <BellOff className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">需安装 PWA · 点击</span>
                        </>
                      ) : (
                        <>
                          <Bell className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">订阅 PWA Push</span>
                        </>
                      )}
                      {notifications.enabled && notifications.newTradesCount > 0 && (
                        <span className="inline-flex items-center justify-center px-1.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold">
                          {notifications.newTradesCount > 99 ? '99+' : notifications.newTradesCount}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPushDebugModal(true)}
                      title="打开 PWA Push 调试面板（测试推送、环境诊断、清除计数等）"
                      className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium ${themes[theme].secondary} hover:opacity-90 ring-1 ring-zinc-500/20`}
                    >
                      <Wrench className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      <span className="hidden sm:inline">订阅调试</span>
                    </button>
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
            {!isSharedView && notifications.enabled && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {notifications.pushServerConfig ? (
                  <span className={`${themes[theme].text} opacity-60`}>
                    后端轮询间隔: {notifications.pushServerConfig.poll_interval_seconds}s
                    {notifications.pushServerConfig.upstream_base_url && (
                      <> · 数据源: {notifications.pushServerConfig.upstream_base_url}</>
                    )}
                  </span>
                ) : notifications.error && /api\/push\/config|VAPID|Push Server|无法连接到 Push/.test(notifications.error) ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Push Server 未连接（{notifications.error.replace(/^.*?[:：]\s*/, '')}）
                  </span>
                ) : (
                  <span className={`${themes[theme].text} opacity-60`}>
                    正在加载 Push Server 配置…
                  </span>
                )}
                {notifications.newTradesCount > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    本次会话已接收 {notifications.newTradesCount} 条推送
                  </span>
                )}
              </div>
            )}
            {!isSharedView && notifications.error && (
              <div className="mt-3 flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
                <span className="break-all">{notifications.error}</span>
              </div>
            )}
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
                onAnalyzeStock={(code, name) => setSelectedStockForAnalysis({ code, name })}
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

      {/* PWA Push 调试面板 */}
      {showPushDebugModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPushDebugModal(false)}
        >
          <div
            className={`${themes[theme].card} rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-4 sm:p-5 border-b ${themes[theme].border} flex items-start justify-between gap-3`}>
              <div>
                <h3 className={`text-base sm:text-lg font-semibold ${themes[theme].text} flex items-center gap-2`}>
                  <Wrench className="w-5 h-5 text-violet-500" />
                  PWA Push 调试面板
                </h3>
                <p className={`mt-1 text-xs ${themes[theme].text} opacity-60`}>
                  这里提供所有 Web Push 相关的测试与诊断工具，方便你排查问题。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPushDebugModal(false)}
                className={`p-2 rounded-lg ${themes[theme].secondary} hover:opacity-80 transition-opacity shrink-0`}
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-5">
              {/* 0. 权限与基础状态 */}
              <section>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className={`text-sm font-semibold ${themes[theme].text}`}>🔑 权限与基础状态</h4>
                    <p className={`text-xs mt-0.5 ${themes[theme].text} opacity-60`}>
                      先把通知权限拿到，其他测试才有可能成功。
                    </p>
                  </div>
                </div>
                <div className={`rounded-xl border ${themes[theme].border} ${themes[theme].background} p-3 sm:p-4 mb-3 text-xs`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 gap-y-3">
                    <div>
                      <div className={`opacity-60 mb-0.5`}>通知权限</div>
                      <div className={`font-mono font-semibold text-sm ${
                        notifications.permission === 'granted'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : notifications.permission === 'denied'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {notifications.permission}
                      </div>
                    </div>
                    <div>
                      <div className={`opacity-60 mb-0.5`}>Push Capable</div>
                      <div className={`font-mono font-semibold text-sm ${
                        notifications.pushCapable === 'yes'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : notifications.pushCapable === 'no'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {notifications.pushCapable}
                      </div>
                    </div>
                    <div>
                      <div className={`opacity-60 mb-0.5`}>已订阅</div>
                      <div className={`font-mono font-semibold text-sm ${
                        notifications.pushSubscribed
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : notifications.enabled
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}>
                        {notifications.pushSubscribed ? '是（后端可推）' : notifications.enabled ? '开启中…' : '否'}
                      </div>
                    </div>
                  </div>
                  {notifications.error && (
                    <div className="mt-3 pt-3 border-t border-dashed border-zinc-300 dark:border-zinc-700 text-rose-600 dark:text-rose-400 whitespace-pre-line break-words">
                      最近一次错误：{notifications.error}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (typeof window === 'undefined' || !('Notification' in window)) {
                      toast.error('当前环境没有 Notification API（iOS PWA 请用 Safari + 主屏，或改用订阅按钮）');
                      return;
                    }
                    try {
                      // 直接调，不做任何前置检查/异步 —— 保证 user gesture 最强
                      const res = await window.Notification.requestPermission();
                      if (res === 'granted') {
                        toast.success('✅ 通知权限已允许，现在可以发送测试通知了');
                      } else if (res === 'denied') {
                        const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
                        const isIos = /iPad|iPhone|iPod/i.test(ua) ||
                          (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
                        const standalone =
                          (typeof navigator !== 'undefined' &&
                            (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
                          (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true);
                        if (isIos && !standalone) {
                          toast(
                            (t) => (
                              <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow-lg rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-700 p-4 text-xs text-zinc-800 dark:text-zinc-200 border-l-4 border-sky-500">
                                <div className="font-semibold text-sm mb-3 text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                                  iOS 需安装为 PWA 才能收到推送
                                </div>
                                <div className="mb-2 opacity-80">
                                  iOS 的 Web Push 在普通标签页里会被直接驳回，<strong className="font-semibold">必须添加到主屏幕</strong>后才能真正允许通知权限。
                                </div>
                                <ol className="space-y-2 mb-3 pl-1 opacity-95">
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-sky-500 font-semibold">①</span>
                                    <span>点 Safari 底部的<strong className="font-semibold">⇪ 分享按钮</strong>（方框+向上箭头）</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-sky-500 font-semibold">②</span>
                                    <span>下滑找到<strong className="font-semibold">「添加到主屏幕」</strong>，右上角点「添加」</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-sky-500 font-semibold">③</span>
                                    <span><strong className="font-semibold">回到桌面，点击刚添加的 App 图标</strong> 重新打开</span>
                                  </li>
                                  <li className="flex gap-2">
                                    <span className="shrink-0 text-emerald-500 font-semibold">④</span>
                                    <span>再次点「请求通知权限」→ 允许通知 ✅</span>
                                  </li>
                                </ol>
                                <div className="text-[11px] opacity-70 mb-3">
                                  ❌ <strong className="font-semibold">不支持 Chrome / Firefox / Edge for iOS</strong>，它们都是 WebKit 外壳。
                                </div>
                                <div className="flex gap-2">
                                  <a
                                    href="https://web.dev/learn/pwa/installation?hl=zh-cn"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20 inline-flex items-center gap-1"
                                  >web.dev 教程
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
                                  </a>
                                  <button
                                    onClick={() => toast.dismiss(t.id)}
                                    className="ml-auto px-2.5 py-1 rounded-md text-[11px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                  >知道了</button>
                                </div>
                              </div>
                            ),
                            { duration: 120_000 }
                          );
                        } else {
                          toast.error(
                            (t) => (
                              <div className="text-xs whitespace-pre-line">
                                <div className="font-semibold mb-1">❌ 通知权限被你选了「阻止」</div>
                                <div>浏览器不会再次弹框，需手动改回：</div>
                                <div>① 地址栏左侧 🔒 → 网站设置 → 通知 → 允许</div>
                                <div>② 然后刷新页面，再点此按钮 / 或清空站点数据后重开</div>
                                <button
                                  onClick={() => toast.dismiss(t.id)}
                                  className="mt-3 px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700"
                                >知道了</button>
                              </div>
                            ),
                            { duration: 60_000 }
                          );
                        }
                      } else {
                        toast(`权限结果：${res}（default=没选，需再点一次或改站点设置）`);
                      }
                    } catch (e) {
                      const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
                      const isIos = /iPad|iPhone|iPod/i.test(ua) ||
                        (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
                      const standalone =
                        (typeof navigator !== 'undefined' &&
                          (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
                        (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true);
                      if (isIos && !standalone) {
                        toast(
                          (t) => (
                            <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow-lg rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-700 p-4 text-xs text-zinc-800 dark:text-zinc-200 border-l-4 border-sky-500">
                              <div className="font-semibold text-sm mb-3 text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                                iOS 需安装为 PWA 才能请求通知权限
                              </div>
                              <div className="mb-2 opacity-80">
                                你在普通 Safari 标签页里调用 <code>Notification.requestPermission()</code> 直接抛错了：
                                <div className="font-mono mt-1 p-2 rounded bg-zinc-100 dark:bg-zinc-800/70">
                                  {e instanceof Error ? e.message : String(e)}
                                </div>
                              </div>
                              <ol className="space-y-2 mb-3 pl-1 opacity-95">
                                <li className="flex gap-2">
                                  <span className="shrink-0 text-sky-500 font-semibold">①</span>
                                  <span>点 Safari 底部的<strong className="font-semibold">⇪ 分享按钮</strong>（方框+向上箭头）</span>
                                </li>
                                <li className="flex gap-2">
                                  <span className="shrink-0 text-sky-500 font-semibold">②</span>
                                  <span>下滑找到<strong className="font-semibold">「添加到主屏幕」</strong>，右上角点「添加」</span>
                                </li>
                                <li className="flex gap-2">
                                  <span className="shrink-0 text-sky-500 font-semibold">③</span>
                                  <span><strong className="font-semibold">回到桌面，点击刚添加的 App 图标</strong> 重新打开</span>
                                </li>
                                <li className="flex gap-2">
                                  <span className="shrink-0 text-emerald-500 font-semibold">④</span>
                                  <span>再次点「请求通知权限」→ 允许通知 ✅</span>
                                </li>
                              </ol>
                              <div className="flex gap-2">
                                <a
                                  href="https://web.dev/learn/pwa/installation?hl=zh-cn"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20 hover:bg-sky-500/20 inline-flex items-center gap-1"
                                >web.dev 教程
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
                                </a>
                                <button
                                  onClick={() => toast.dismiss(t.id)}
                                  className="ml-auto px-2.5 py-1 rounded-md text-[11px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                >知道了</button>
                              </div>
                            </div>
                          ),
                          { duration: 120_000 }
                        );
                      } else {
                        toast.error('requestPermission 抛错：' + (e instanceof Error ? e.message : String(e)));
                      }
                    }
                  }}
                  className={`w-full inline-flex items-start gap-3 text-left p-3 rounded-xl border transition-all duration-200 ${
                    themes[theme].border
                  } bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-500/15 dark:to-blue-500/15 ring-1 ring-sky-500/20 hover:ring-2 hover:ring-sky-500/40 active:scale-[0.98]`}
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${themes[theme].text}`}>请求通知权限</div>
                    <div className={`text-xs mt-1 ${themes[theme].text} opacity-75`}>
                      直接调 <code className="px-1.5 py-0.5 rounded bg-white/60 dark:bg-zinc-800/60">Notification.requestPermission()</code>，
                      会弹出系统级「允许 / 阻止」通知请求框。<span className="font-semibold text-sky-600 dark:text-sky-300">如果连这个按钮都不弹框</span>，
                      说明你之前选过「阻止」，先在地址栏 🔒 里把通知从阻止改回允许。
                    </div>
                  </div>
                </button>
              </section>

              {/* 1. 测试通知 */}
              <section>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className={`text-sm font-semibold ${themes[theme].text}`}>📬 测试通知</h4>
                    <p className={`text-xs mt-0.5 ${themes[theme].text} opacity-60`}>
                      分别验证两条不同的链路：直接在本地弹通知，以及走后端 Push Server 再推回来。
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      notifications.sendTestDesktopNotification();
                    }}
                    className={`w-full inline-flex items-start gap-3 text-left p-3 rounded-xl border transition-all duration-200 ${
                      themes[theme].border
                    } ${themes[theme].secondary} hover:ring-2 hover:ring-blue-500/30 active:scale-[0.98]`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${themes[theme].text}`}>本地桌面通知测试</div>
                      <div className={`text-xs mt-1 ${themes[theme].text} opacity-60`}>
                        立刻在本机弹一条桌面通知（不走 Push Server，不关闭页面也有效）。
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void notifications.sendTestWebPush()}
                    disabled={!notifications.enabled}
                    className={`w-full inline-flex items-start gap-3 text-left p-3 rounded-xl border transition-all duration-200 ${
                      themes[theme].border
                    } ${themes[theme].secondary} ${
                      notifications.enabled
                        ? 'hover:ring-2 hover:ring-violet-500/30 active:scale-[0.98]'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${themes[theme].text}`}>后端测试 Web Push</div>
                      <div className={`text-xs mt-1 ${themes[theme].text} opacity-60`}>
                        调 <code className="px-1.5 py-0.5 rounded bg-zinc-200/50 dark:bg-zinc-700/50">/api/push/test</code> 走完整链路（Push Server → 浏览器 → 桌面）。
                      </div>
                      {!notifications.enabled && (
                        <div className={`text-[11px] mt-2 text-amber-600 dark:text-amber-400 font-medium`}>
                          需先订阅后才能发送
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              </section>

              {/* 2. 环境诊断 */}
              <section>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className={`text-sm font-semibold ${themes[theme].text}`}>🔎 环境诊断</h4>
                    <p className={`text-xs mt-0.5 ${themes[theme].text} opacity-60`}>
                      逐项检查浏览器是否满足 PWA Push 的前置条件，并给出具体修复建议。
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await notifications.diagnoseDesktopNotifications();
                      const lines = [
                        `平台: ${r.platform || '未知'}${r.isIos ? ' (iOS)' : ''}${r.isAndroid ? ' (Android)' : ''}`,
                        `iOS Safari: ${r.isIosSafari ? '是' : '否'}`,
                        `Android Chrome: ${r.isAndroidChrome ? '是' : '否'}`,
                        `已添加到主屏幕(PWA): ${r.isStandalone ? '是' : '否'}`,
                        '',
                        `通知权限: ${r.notificationApi}`,
                        `安全上下文: ${r.secureContext ? '✓' : '✗'}`,
                        `SW 支持: ${r.serviceWorkerSupported ? '✓' : '✗'}`,
                        `SW 激活: ${r.serviceWorkerActive ? '✓' : '✗'}`,
                        `PushManager: ${r.pushManagerSupported ? '✓' : '✗'}`,
                        '',
                        r.details,
                      ];
                      toast((t) => (
                        <div className="max-w-md w-full bg-white dark:bg-zinc-900 shadow-lg rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-700 p-4 text-xs font-mono whitespace-pre-line text-zinc-800 dark:text-zinc-200 border-l-4 border-blue-500">
                          <div className="font-semibold text-sm mb-2">桌面通知诊断结果</div>
                          <div className="mb-3">{lines.join('\n')}</div>
                          <button
                            onClick={() => toast.dismiss(t.id)}
                            className="px-2 py-1 rounded text-[11px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          >关闭</button>
                        </div>
                      ), { duration: 60_000 });
                    }}
                    className={`w-full inline-flex items-start gap-3 text-left p-3 rounded-xl border transition-all duration-200 ${
                      themes[theme].border
                    } ${themes[theme].secondary} hover:ring-2 hover:ring-blue-500/30 active:scale-[0.98]`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${themes[theme].text}`}>桌面通知环境诊断</div>
                      <div className={`text-xs mt-1 ${themes[theme].text} opacity-60`}>
                        检查权限、Service Worker、iOS / Android 平台限制，给出中文修复建议。
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const r = await notifications.diagnosePushSubscriptionFlow();
                      const lines = [
                        ...r.stepLog,
                        '',
                        '---总结---',
                        r.willSendSubscribeRequestIfClick
                          ? '✅ 点订阅按钮时，应当会发送 POST /api/push/subscribe'
                          : '❌ 点订阅按钮时，不会发送 /api/push/subscribe（缺少前置条件）',
                        '',
                        r.hint,
                        r.lastError
                          ? `\n最近一次错误: ${r.lastError}`
                          : '',
                      ].filter(Boolean);
                      toast((t) => (
                        <div className="max-w-lg w-full bg-white dark:bg-zinc-900 shadow-lg rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-700 p-4 text-xs font-mono whitespace-pre-line text-zinc-800 dark:text-zinc-200 border-l-4 border-violet-500">
                          <div className="font-semibold text-sm mb-2 text-violet-600 dark:text-violet-400">PWA Push 订阅流程诊断 · 13 步检查</div>
                          <div className="mb-3 max-h-[60vh] overflow-y-auto">{lines.join('\n')}</div>
                          <button
                            onClick={() => toast.dismiss(t.id)}
                            className="px-2 py-1 rounded text-[11px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          >关闭</button>
                        </div>
                      ), { duration: 60_000 });
                    }}
                    className={`w-full inline-flex items-start gap-3 text-left p-3 rounded-xl border transition-all duration-200 ${
                      themes[theme].border
                    } ${themes[theme].secondary} hover:ring-2 hover:ring-violet-500/30 active:scale-[0.98]`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${themes[theme].text}`}>订阅流程诊断</div>
                      <div className={`text-xs mt-1 ${themes[theme].text} opacity-60`}>
                        13 步逐步检查为什么没发 <code className="px-1.5 py-0.5 rounded bg-zinc-200/50 dark:bg-zinc-700/50">/api/push/subscribe</code>，给出修复建议。
                      </div>
                    </div>
                  </button>
                </div>
              </section>

              {/* 3. 工具 */}
              <section>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className={`text-sm font-semibold ${themes[theme].text}`}>🛠 工具</h4>
                    <p className={`text-xs mt-0.5 ${themes[theme].text} opacity-60`}>
                      常用小工具：重新探测 Push 能力、清除未读计数。
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void notifications.retryProbePushCapability()}
                    className={`w-full inline-flex items-start gap-3 text-left p-3 rounded-xl border transition-all duration-200 ${
                      themes[theme].border
                    } ${themes[theme].secondary} hover:ring-2 hover:ring-amber-500/30 active:scale-[0.98]`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <RefreshCw className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${themes[theme].text}`}>重新探测 Push 能力</div>
                      <div className={`text-xs mt-1 ${themes[theme].text} opacity-60`}>
                        清除缓存并重新检测 Service Worker / PushManager（刚添加主屏、刚刷新配置时用）。
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={notifications.resetCount}
                    disabled={!notifications.enabled || notifications.newTradesCount === 0}
                    className={`w-full inline-flex items-start gap-3 text-left p-3 rounded-xl border transition-all duration-200 ${
                      themes[theme].border
                    } ${themes[theme].secondary} ${
                      notifications.enabled && notifications.newTradesCount > 0
                        ? 'hover:ring-2 hover:ring-rose-500/30 active:scale-[0.98]'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                      <X className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${themes[theme].text}`}>清除未读计数</div>
                      <div className={`text-xs mt-1 ${themes[theme].text} opacity-60`}>
                        清零订阅按钮右上角的小红点徽章（当前 {notifications.newTradesCount} 条）。
                      </div>
                    </div>
                  </button>
                </div>
              </section>

              {/* 4. 如何安装为 PWA（帮助） */}
              <section>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className={`text-sm font-semibold ${themes[theme].text}`}>📘 如何安装为 PWA（才能收到推送）</h4>
                    <p className={`text-xs mt-0.5 ${themes[theme].text} opacity-60`}>
                      PWA Push 只有在「添加到主屏幕 / 安装应用」模式下才真正生效。按你使用的设备选择安装步骤。
                    </p>
                  </div>
                  <a
                    href="https://web.dev/learn/pwa/installation?hl=zh-cn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${themes[theme].secondary} ring-1 ring-zinc-500/20 hover:opacity-90`}
                    title="打开 web.dev 官方 PWA 安装指南（新窗口）"
                  >
                    web.dev <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* iOS 步骤 —— 默认高亮展开，因为限制最多 */}
                <div className={`rounded-xl border ${themes[theme].border} bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/70 dark:from-sky-500/10 dark:via-zinc-900/40 dark:to-indigo-500/10 p-3 sm:p-4 mb-3`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                        <line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${themes[theme].text}`}>iPhone / iPad (iOS)</div>
                      <div className={`text-[11px] mt-0.5 ${themes[theme].text} opacity-70`}>iOS 的通知限制最严格，必须用 Safari + 添加到主屏幕</div>
                    </div>
                  </div>
                  <ol className={`text-xs space-y-2.5 ${themes[theme].text} opacity-90 list-none pl-0`}>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold text-[11px] border border-sky-500/20">1</span>
                      <span>
                        先确认<strong className="font-semibold"> iOS 版本 ≥ 16.4</strong>（设置 → 通用 → 软件更新）。
                        <span className={`block mt-0.5 opacity-70`}>低于此版本的 iOS 完全不支持 Web Push。</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold text-[11px] border border-sky-500/20">2</span>
                      <span>
                        必须使用<strong className="font-semibold">系统自带的 Safari 浏览器</strong>打开页面。
                        <span className={`block mt-0.5 opacity-70`}>❌ Chrome / Firefox / Edge for iOS 都是 WebKit 外壳，<strong className="font-semibold">全部不支持 Web Push</strong>。</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold text-[11px] border border-sky-500/20">3</span>
                      <span>
                        点击 Safari 底部工具栏的<strong className="font-semibold"> ⇪ 分享按钮</strong>（方框+向上箭头）。
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold text-[11px] border border-sky-500/20">4</span>
                      <span>
                        在分享菜单里下滑找到<strong className="font-semibold">「添加到主屏幕」</strong>（Add to Home Screen），点进去。
                        <span className={`block mt-0.5 opacity-70`}>可以自己取个 App 名字，点右上角「添加」。</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold text-[11px] border border-sky-500/20">5</span>
                      <span>
                        <strong className="font-semibold">回到手机桌面，点击刚刚添加的 App 图标</strong>重新打开页面。
                        <span className={`block mt-0.5 opacity-70`}>这一步最关键 —— 必须从主屏图标打开，不能在 Safari 标签页里继续用。</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">6</span>
                      <span>
                        点击 <code className="px-1.5 py-0.5 rounded bg-white/60 dark:bg-zinc-800/60 text-[11px]">「订阅 PWA Push」</code> 按钮。
                        <span className={`block mt-0.5 opacity-70`}>系统会弹出「允许通知」请求 → 选「允许」 → 完成 ✅</span>
                      </span>
                    </li>
                  </ol>
                  <div className={`mt-3 pt-3 border-t border-sky-500/20 text-[11px] ${themes[theme].text} opacity-80`}>
                    💡 <strong>安装后如何确认是 PWA 模式？</strong> 页面顶部<strong>不会有 Safari 地址栏</strong>，没有分享按钮，也没有前进/后退箭头，整个应用全屏显示，像原生 App 一样。
                  </div>
                </div>

                {/* Android 步骤 */}
                <div className={`rounded-xl border ${themes[theme].border} ${themes[theme].background} p-3 sm:p-4 mb-3`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <line x1="13" y1="2" x2="13" y2="22"/>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${themes[theme].text}`}>Android（Chrome / Edge）</div>
                      <div className={`text-[11px] mt-0.5 ${themes[theme].text} opacity-70`}>Android 支持比较宽松，Chrome 原生支持 PWA 安装和推送</div>
                    </div>
                  </div>
                  <ol className={`text-xs space-y-2.5 ${themes[theme].text} opacity-90 list-none pl-0`}>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">1</span>
                      <span>使用 Chrome（或基于 Chromium 的 Edge）用 <strong className="font-semibold">HTTPS</strong> 访问站点（localhost / 纯 http 不支持 PWA）。</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">2</span>
                      <span>浏览器<strong className="font-semibold">地址栏右侧通常会出现一个 ➕ 安装图标</strong>，或打开右上角 ⋮ 菜单 → <strong className="font-semibold">「安装应用」</strong> / 「添加到主屏幕」。</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">3</span>
                      <span>点击后按弹窗提示确认安装 → 系统会生成一个桌面图标。</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">4</span>
                      <span><strong className="font-semibold">从桌面图标启动 App</strong>，打开后点击「订阅 PWA Push」→ 允许通知，完成 ✅。</span>
                    </li>
                  </ol>
                  <div className={`mt-3 pt-3 border-t border-emerald-500/20 text-[11px] ${themes[theme].text} opacity-80`}>
                    💡 <strong>注意：</strong>开发模式下用 <code className="px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800/60">npm run dev</code> 启动的 vite（端口 5173）通常<strong>不会注册有效 Service Worker</strong>，建议 <code className="px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800/60">npm run build && npm run preview</code> 后用预览端口访问。
                  </div>
                </div>

                {/* 桌面端步骤 */}
                <div className={`rounded-xl border ${themes[theme].border} ${themes[theme].background} p-3 sm:p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${themes[theme].text}`}>桌面端（Windows / macOS / Linux，Chrome / Edge）</div>
                      <div className={`text-[11px] mt-0.5 ${themes[theme].text} opacity-70`}>桌面端不用强制安装也能收通知，但安装后关页推送更稳定</div>
                    </div>
                  </div>
                  <ol className={`text-xs space-y-2.5 ${themes[theme].text} opacity-90 list-none pl-0`}>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 font-semibold text-[11px] border border-violet-500/20">1</span>
                      <span>在地址栏输入 <code className="px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800/60">chrome://settings/content/notifications</code>（Edge 同路径），确认本网站的通知权限是「允许」不是「阻止」。</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 font-semibold text-[11px] border border-violet-500/20">2</span>
                      <span>（推荐安装 PWA）地址栏右侧出现 ➕ 安装图标 → 点「安装 YHTrader」，浏览器会生成一个独立窗口。</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 font-semibold text-[11px] border border-violet-500/20">3</span>
                      <span>Windows：设置 → 系统 → 通知 → <strong className="font-semibold">通知总开关 打开</strong> → 下面的 Chrome / Edge 开关也要打开；<strong className="font-semibold">「专注助手 / 免打扰」关闭</strong>（否则全局吞通知）。</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 font-semibold text-[11px] border border-violet-500/20">4</span>
                      <span>macOS：系统设置 → 通知 → Chrome / Edge / PWA App → 允许通知；<strong className="font-semibold">勿扰模式关闭</strong>。</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">5</span>
                      <span>回到应用，点击 <code className="px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800/60 text-[11px]">「订阅 PWA Push」</code> → 允许，完成 ✅。</span>
                    </li>
                  </ol>
                </div>
              </section>
            </div>

            <div className={`p-4 sm:p-5 border-t ${themes[theme].border} flex justify-end gap-3`}>
              <button
                type="button"
                onClick={() => setShowPushDebugModal(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${themes[theme].secondary} hover:opacity-80 transition-opacity`}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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
