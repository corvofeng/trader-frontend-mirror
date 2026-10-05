import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, BarChart2, TrendingUp, History, RefreshCw, Zap } from 'lucide-react';
import type { Theme } from '../../lib/theme';
import { themes } from '../../lib/theme';
import type { User, Holding, Trade } from '../../lib/services/types';
import { AccountSelector } from '../../shared/components/AccountSelector';
import { portfolioService } from '../../lib/services';
import {
  JOURNAL_ACCOUNT_STORAGE,
  persistAccountAlias,
  resolveCurrentAccountAlias,
} from '../../shared/utils/accountSelection';
import { M3BottomNav, type TerminalTab } from './components/M3BottomNav';
import { TerminalPortfolioView } from './components/TerminalPortfolioView';
import { TerminalOptionsView } from './components/TerminalOptionsView';
import { TerminalTradeView } from './components/TerminalTradeView';
import { TerminalHistoryView } from './components/TerminalHistoryView';
import { OptionPriceWebSocketProvider } from '../../features/options/context/OptionPriceWebSocketContext';
import toast from 'react-hot-toast';

interface TerminalPageProps {
  theme: Theme;
  user?: User | null;
}

function TerminalContent({ theme, user }: TerminalPageProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // 默认 Tab：portfolio（资产中心）
  const [activeTab, setActiveTab] = useState<TerminalTab>(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t === 'options' || t === 'trade' || t === 'history') return t;
    return 'portfolio';
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => {
    return resolveCurrentAccountAlias({
      search: location.search,
      storage: JOURNAL_ACCOUNT_STORAGE,
    });
  });

  const [refreshKey, setRefreshKey] = useState(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [dateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // URL Tab 同步
  const handleTabChange = (nextTab: TerminalTab) => {
    setActiveTab(nextTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', nextTab);
    if (selectedAccountId) params.set('account_alias', selectedAccountId);
    navigate(`/terminal?${params.toString()}`, { replace: true });
  };

  const handleAccountChange = useCallback((accId: string) => {
    setSelectedAccountId(accId);
    persistAccountAlias(accId, { storage: JOURNAL_ACCOUNT_STORAGE });
    setHoldings([]);
    const params = new URLSearchParams(location.search);
    params.set('account_alias', accId);
    if (activeTab) params.set('tab', activeTab);
    navigate(`/terminal?${params.toString()}`, { replace: true });
    setRefreshKey((k) => k + 1);
  }, [activeTab, location.search, navigate]);

  // 获取现货持仓与交易数据
  const fetchPortfolioData = useCallback(async () => {
    if (!selectedAccountId) return;
    setIsPortfolioLoading(true);
    try {
      const [holdingsResp, tradesResp] = await Promise.all([
        portfolioService.getHoldings(selectedAccountId),
        portfolioService.getRecentTrades(selectedAccountId, dateRange.startDate, dateRange.endDate),
      ]);
      if (holdingsResp.data) {
        setHoldings(holdingsResp.data);
      }
      if (tradesResp.data) {
        setRecentTrades(tradesResp.data);
      }
    } catch (e) {
      console.error('Failed to load portfolio data:', e);
    } finally {
      setIsPortfolioLoading(false);
    }
  }, [selectedAccountId, dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData, refreshKey]);

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-zinc-950 font-sans transition-colors duration-200">
      {/* 顶部 M3 Top App Bar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-zinc-800/80 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          {/* 左侧：系统标识与标头 */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/30">
              <Zap className="w-4 h-4 fill-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white">
                  交易终端
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Terminal
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500 dark:text-zinc-400">
                综合资产 · 期权衍生品 · 智能策略与风控
              </p>
            </div>
          </div>

          {/* 中间/桌面端专属：M3 桌面水平导航栏 */}
          <div className="hidden md:flex items-center gap-1 p-1 rounded-2xl bg-slate-100/80 dark:bg-zinc-800/80 border border-slate-200/60 dark:border-zinc-700/60">
            {[
              { id: 'portfolio' as TerminalTab, label: '资产中心', icon: Briefcase },
              { id: 'options' as TerminalTab, label: '期权看盘', icon: BarChart2 },
              { id: 'trade' as TerminalTab, label: '交易计划', icon: TrendingUp },
              { id: 'history' as TerminalTab, label: '成交流水', icon: History },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium btn-tactile transition-all duration-150 ${
                    isActive
                      ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* 右侧：账户选择器与全局状态 */}
          <div className="flex items-center gap-2 shrink-0">
            <AccountSelector
              userId={user?.id || 'demo'}
              theme={theme}
              selectedAccountId={selectedAccountId}
              onAccountChange={handleAccountChange}
              align="right"
            />

            <button
              type="button"
              onClick={() => {
                setRefreshKey((k) => k + 1);
                fetchPortfolioData();
                toast.success('终端数据已全面同步');
              }}
              className={`p-1.5 sm:p-2 rounded-xl border ${themes[theme].border} ${themes[theme].secondary} btn-tactile text-slate-600 dark:text-zinc-300 hover:text-blue-600`}
              title="全局刷新"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isPortfolioLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* 主视口工作区 */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
        {activeTab === 'portfolio' && (
          <TerminalPortfolioView
            theme={theme}
            selectedAccountId={selectedAccountId}
            holdings={holdings}
            isPortfolioLoading={isPortfolioLoading}
            onRefresh={() => {
              setRefreshKey((k) => k + 1);
              fetchPortfolioData();
            }}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === 'options' && (
          <TerminalOptionsView
            theme={theme}
            selectedAccountId={selectedAccountId}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === 'trade' && (
          <TerminalTradeView
            theme={theme}
            selectedAccountId={selectedAccountId}
            userId={user?.id}
          />
        )}

        {activeTab === 'history' && (
          <TerminalHistoryView
            theme={theme}
            selectedAccountId={selectedAccountId}
            recentTrades={recentTrades}
            dateRange={dateRange}
          />
        )}
      </main>

      {/* 移动端固定 M3 底部导航栏 */}
      <M3BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        theme={theme}
      />
    </div>
  );
}

export function TerminalPage(props: TerminalPageProps) {
  return (
    <OptionPriceWebSocketProvider>
      <TerminalContent {...props} />
    </OptionPriceWebSocketProvider>
  );
}

export default TerminalPage;
