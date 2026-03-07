import React, { useEffect, useState } from 'react';
import { Theme, themes } from '../../../lib/theme';
import { OptionsAnalysisView } from '../../../features/options/components/OptionsAnalysisView';
import { PortfolioAnalysisPanel } from '../../../features/portfolio/components/PortfolioAnalysisPanel';
import { useOptionPriceWebSocket } from '../../../features/options/hooks/useOptionPriceWebSocket';
import { authService, optionsService } from '../../../lib/services';
import type { OptionsPortfolioData } from '../../../lib/services/types';
import { Activity, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';

interface OptionsAnalysisTabProps {
  theme: Theme;
  selectedSymbol?: string;
  selectedAccountId?: string | null;
}

const DEMO_USER_ID = 'mock-user-id';

export function OptionsAnalysisTab({ theme, selectedSymbol, selectedAccountId }: OptionsAnalysisTabProps) {
  const [portfolioData, setPortfolioData] = useState<OptionsPortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const { isConnected, send, portfolioSnapshot } = useOptionPriceWebSocket();
  const [isPortfolioAnalysisOpen, setIsPortfolioAnalysisOpen] = useState(false);

  // Fetch user ID
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const authRes = await authService.getUser();
        const user = authRes?.data?.user;
        setCurrentUserId(user?.id || DEMO_USER_ID);
      } catch {
        setCurrentUserId(DEMO_USER_ID);
      }
    };
    fetchUser();
  }, []);

  // Initial fetch via REST API
  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!currentUserId) return;
      
      try {
        setIsLoading(true);
        // We fetch both portfolio and analysis to construct a complete view, 
        // similar to OptionsPortfolio.tsx, although we mainly need analysis.
        const [portfolioRes, analysisRes] = await Promise.all([
          optionsService.getOptionsPortfolio(currentUserId, selectedAccountId, selectedSymbol ? { symbol: selectedSymbol } : undefined),
          optionsService.getPortfolioAnalysis(currentUserId, selectedAccountId)
        ]);

        if (portfolioRes.data) {
          const data = portfolioRes.data;
          if (analysisRes.data) {
            data.expiry_analysis = analysisRes.data;
          }
          setPortfolioData(data);
        }
      } catch (error) {
        console.error('Error fetching analysis data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalysis();
  }, [currentUserId, selectedAccountId, selectedSymbol]);

  // WebSocket polling for updates
  useEffect(() => {
    if (!isConnected || !currentUserId) return;

    const queryPortfolio = () => {
      const payload = {
        action: 'query_options_portfolio',
        accountId: selectedAccountId,
        userId: currentUserId
      };
      send(payload);
    };

    // Initial query via WS
    queryPortfolio();

    // Poll every 3 seconds
    const intervalId = setInterval(queryPortfolio, 3000);

    return () => clearInterval(intervalId);
  }, [isConnected, currentUserId, send, selectedAccountId, selectedSymbol]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!portfolioSnapshot) return;

    setPortfolioData(prev => {
      // Preserve expiry_analysis if missing in snapshot but present in previous data
      // (Snapshot might not include analysis if it's a partial update or different endpoint)
      // Actually query_options_portfolio usually returns full portfolio structure, 
      // but maybe not the heavy analysis part if it's calculated separately?
      // In OptionsPortfolio.tsx, it preserves it.
      const analysis = portfolioSnapshot.expiry_analysis || prev?.expiry_analysis;
      return {
        ...portfolioSnapshot,
        expiry_analysis: analysis
      };
    });
  }, [portfolioSnapshot]);

  return (
    <div className="space-y-6">
      {/* Options Expiry Analysis */}
      {isLoading && !portfolioData ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className={`${themes[theme].text} opacity-70`}>正在加载分析数据...</p>
        </div>
      ) : !portfolioData ? (
        <div className={`${themes[theme].card} rounded-lg p-12 text-center`}>
          <Activity className={`w-12 h-12 mx-auto mb-4 ${themes[theme].text} opacity-30`} />
          <h3 className={`text-lg font-medium ${themes[theme].text} mb-2`}>暂无数据</h3>
          <p className={`${themes[theme].text} opacity-70`}>无法获取投资组合数据。</p>
        </div>
      ) : (
        <OptionsAnalysisView portfolioData={portfolioData} theme={theme} />
      )}

      {/* Portfolio Analysis Report - Collapsible & at Bottom */}
      <div className={`${themes[theme].card} rounded-lg overflow-hidden border ${themes[theme].border}`}>
        <div 
          className={`p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isPortfolioAnalysisOpen ? `border-b ${themes[theme].border}` : ''}`}
          onClick={() => setIsPortfolioAnalysisOpen(!isPortfolioAnalysisOpen)}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${themes[theme].secondary}`}>
              <BarChart2 className={`w-5 h-5 ${themes[theme].text}`} />
            </div>
            <div>
              <h3 className={`text-lg font-bold ${themes[theme].text}`}>账户投资组合分析报告</h3>
              <p className={`text-sm ${themes[theme].text} opacity-70`}>
                查看整体账户表现、风险指标及再平衡建议
              </p>
            </div>
          </div>
          {isPortfolioAnalysisOpen ? (
            <ChevronUp className={`w-5 h-5 ${themes[theme].text} opacity-50`} />
          ) : (
            <ChevronDown className={`w-5 h-5 ${themes[theme].text} opacity-50`} />
          )}
        </div>
        
        {isPortfolioAnalysisOpen && (
          <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/10">
            <PortfolioAnalysisPanel 
              theme={theme} 
              userId={currentUserId || undefined}
              selectedAccountId={selectedAccountId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
