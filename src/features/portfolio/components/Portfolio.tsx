import React, { useEffect, useRef, useState } from 'react';
import { logger } from '../../../shared/utils/logger';
import { format, subDays } from 'date-fns';
import { ArrowUpCircle, ArrowDownCircle, Calendar, Filter, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, BarChart2, Briefcase, ExternalLink, Camera } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { Holding, Trade, TrendData } from '../../../lib/services/types';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import { portfolioService } from '../../../lib/services';
import { PortfolioTrend } from './PortfolioTrend';
import { PortfolioHeatmap } from './PortfolioHeatmap';
import { StockAnalysisModal } from './StockAnalysisModal';
import { PortfolioAnalysisPanel } from './PortfolioAnalysisPanel';
import { AccountSelector } from '../../../shared/components';
import { X, Download, Share2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ScreenshotPreview } from './ScreenshotPreview';
import { HoldingsTable } from './HoldingsTable';
import { TradesTable } from './TradesTable';
import { OverviewControls } from './OverviewControls';
import { PortfolioHeader } from './PortfolioHeader';
import { StatsGrid } from './StatsGrid';

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
  dateRange: {
    startDate: string;
    endDate: string;
  };
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isSharedView?: boolean;
  userId?: string;
  selectedAccountId?: string | null;
  onAccountChange?: (accountId: string) => void;
}

const DEMO_USER_ID = 'mock-user-id';
const DEMO_ACCOUNT_ID = 'mock-account-id';

export function Portfolio({ 
  holdings, 
  theme, 
  recentTrades = [], 
  dateRange, 
  onDateRangeChange,
  isSharedView = false,
  userId,
  selectedAccountId,
  onAccountChange
}: PortfolioProps) {
  const [showRecentTrades, setShowRecentTrades] = useState(true);
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [holdingsPerPage, setHoldingsPerPage] = useState(5);
  const [holdingsSort, setHoldingsSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'total_value', direction: 'desc' });
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPerPage, setTradesPerPage] = useState(5);
  const [tradesSort, setTradesSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'created_at', direction: 'desc' });
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [selectedStockForAnalysis, setSelectedStockForAnalysis] = useState<{ code: string; name: string } | null>(null);
  const [showPortfolioAnalysis, setShowPortfolioAnalysis] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const journalRef = useRef<HTMLDivElement>(null);
  const { currencyConfig } = useCurrency();
  
  // Calculate portfolio metrics
  const totalHoldingsValue = holdings.reduce((sum, holding) => sum + holding.total_value, 0);
  const totalProfitLoss = holdings.reduce((sum, holding) => sum + holding.profit_loss, 0);
  
  // Get latest trend value for total market value
  const latestTrendValue = trendData.length > 0 ? trendData[trendData.length - 1].value : totalHoldingsValue;
  
  // Calculate position ratio
  const positionRatio = latestTrendValue > 0 ? (totalHoldingsValue / latestTrendValue) * 100 : 0;

  // Get UUID from URL params for portfolio sharing
  const portfolioUuid = new URLSearchParams(window.location.search).get('uuid');

  useEffect(() => {
    const fetchTrendData = async () => {
      try {
        let response;
        if (portfolioUuid) {
          // Use UUID-based API for shared portfolios
          response = await portfolioService.getTrendDataByUuid(
            portfolioUuid,
            dateRange.startDate,
            dateRange.endDate
          );
        } else if (!isSharedView) {
          // Fix null handling for accountId when calling services
    if (!userId || !selectedAccountId) {
      logger.debug('[Portfolio] Guard: user/account missing', { userId, selectedAccountId });
      return;
    }

          response = await portfolioService.getTrendData(
            userId,
            dateRange.startDate,
            dateRange.endDate,
            selectedAccountId,
          );
        }
        
        if (response?.data) {
          setTrendData(response.data);
        }
      } catch (error) {
        console.error('Error fetching trend data:', error);
      }
    };

    fetchTrendData();
  }, [dateRange, isSharedView, portfolioUuid, selectedAccountId, userId]);

  const setQuickDateRange = (days: number) => {
    if (isSharedView && !portfolioUuid) return; // Disable date range changes in shared view without UUID
    
    const endDate = new Date();
    const startDate = subDays(endDate, days);
    onDateRangeChange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
  };

  const sortHoldings = (holdings: Holding[]) => {
    return [...holdings].sort((a, b) => {
      const multiplier = holdingsSort.direction === 'asc' ? 1 : -1;
      switch (holdingsSort.field) {
        case 'stock_code':
          return multiplier * a.stock_code.localeCompare(b.stock_code);
        case 'total_value':
          return multiplier * (a.total_value - b.total_value);
        case 'profit_loss_percentage':
          return multiplier * (a.profit_loss_percentage - b.profit_loss_percentage);
        default:
          return 0;
      }
    });
  };

  const sortTrades = (trades: Trade[]) => {
    return [...trades].sort((a, b) => {
      const multiplier = tradesSort.direction === 'asc' ? 1 : -1;
      switch (tradesSort.field) {
        case 'created_at':
          return multiplier * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        case 'stock_code':
          return multiplier * a.stock_code.localeCompare(b.stock_code);
        case 'operation':
          return multiplier * a.operation.localeCompare(b.operation);
        case 'target_price':
          return multiplier * (a.target_price - b.target_price);
        case 'quantity':
          return multiplier * (a.quantity - b.quantity);
        default:
          return 0;
      }
    });
  };

  const sortedHoldings = sortHoldings(holdings);
  const sortedTrades = sortTrades(recentTrades);

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
  const isSmallMobile = screenSize.width <= 390;

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { 
      padding: { 
        top: isSmallMobile ? 4 : 8, 
        right: isSmallMobile ? 2 : (isMobile ? 4 : 8), 
        bottom: isSmallMobile ? 4 : (isMobile ? 8 : 16), 
        left: isSmallMobile ? 2 : (isMobile ? 4 : 8) 
      } 
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: theme === 'dark' ? '#e5e7eb' : '#111827',
          font: { size: isSmallMobile ? 9 : (isMobile ? 10 : 12) },
          boxWidth: isSmallMobile ? 6 : (isMobile ? 8 : 12),
          padding: isSmallMobile ? 4 : (isMobile ? 6 : 16),
          usePointStyle: isSmallMobile,
          maxWidth: isSmallMobile ? 80 : (isMobile ? 120 : undefined),
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${formatCurrency(value, currencyConfig)} (${percentage}%)`;
          }
        }
      }
    },
  };

  const SortIcon = ({ field, currentSort }: { field: string, currentSort: { field: string; direction: 'asc' | 'desc' } }) => {
    if (field !== currentSort.field) {
      return <ArrowUp className="w-4 h-4 opacity-30" />;
    }
    return currentSort.direction === 'asc' ? 
      <ArrowUp className="w-4 h-4" /> : 
      <ArrowDown className="w-4 h-4" />;
  };

  const handleHoldingsSort = (field: string) => {
    setHoldingsSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleTradesSort = (field: string) => {
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
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        quality: 0.95,
        // 为截图添加额外的底部内边距，避免最下方文本被截断
        style: {
          paddingBottom: '24px',
          backgroundColor: 'transparent',
        },
        width: node.scrollWidth,
        height: node.scrollHeight + 24,
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
    <div className="space-y-6" ref={journalRef}>
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

      {/* Portfolio Analysis Panel */}
      <div className="mt-6">
        <PortfolioHeader
          theme={theme}
          showPortfolioAnalysis={showPortfolioAnalysis}
          onToggle={() => setShowPortfolioAnalysis(!showPortfolioAnalysis)}
          onScreenshot={handleScreenshot}
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

      {/* Stock Analysis Modal */}
      {selectedStockForAnalysis && (
        <StockAnalysisModal
          stockCode={selectedStockForAnalysis.code}
          stockName={selectedStockForAnalysis.name}
          theme={theme}
          onClose={() => setSelectedStockForAnalysis(null)}
        />
      )}
      <div className={`${themes[theme].card} rounded-lg shadow-md`}>
        <div className="p-6 border-b border-gray-200">
          <OverviewControls
            theme={theme}
            userId={userId}
            selectedAccountId={selectedAccountId ?? null}
            onAccountChange={onAccountChange}
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
            isSharedView={isSharedView}
            portfolioUuid={portfolioUuid}
            onQuickSelect={setQuickDateRange}
          />
          <StatsGrid
            theme={theme}
            currencyConfig={currencyConfig}
            latestTrendValue={latestTrendValue}
            totalHoldingsValue={totalHoldingsValue}
            positionRatio={positionRatio}
            totalProfitLoss={totalProfitLoss}
            hasTrendData={trendData.length > 0}
          />
        </div>

        {trendData.length > 0 && (
          <PortfolioTrend 
            trendData={trendData}
            theme={theme}
            dateRange={dateRange}
          />
        )}

        <PortfolioHeatmap 
          holdings={holdings}
          theme={theme}
        />

        <div className="grid lg:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6">
          <div className="order-2 lg:order-1">
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
            />
          </div>

          <div className="order-1 lg:order-2">
            <div className="h-[200px] xs:h-[220px] sm:h-[280px] md:h-[320px] lg:h-[400px] relative">
              <Pie data={pieChartData} options={pieChartOptions} />
            </div>
          </div>
        </div>
      </div>

      {recentTrades.length > 0 && (
        <div className={`${themes[theme].card} rounded-lg shadow-md`}>
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <h2 className={`text-lg font-semibold ${themes[theme].text} whitespace-nowrap`}>成交记录</h2>
              <div className="flex items-center gap-2">
                <select
                  value={tradesPerPage}
                  onChange={(e) => setTradesPerPage(Number(e.target.value))}
                  className={`px-2 py-1 rounded-md text-sm ${themes[theme].input} ${themes[theme].text}`}
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
            <div className="p-4">
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
              />
            </div>
          )}
        </div>
      )}

      {/* Screenshot Preview Modal */}
      {imageUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className={`${themes[theme].card} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col`}>
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className={`text-lg font-semibold ${themes[theme].text}`}>
                持仓数据预览
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
        />
      )}
    </div>
  );
}