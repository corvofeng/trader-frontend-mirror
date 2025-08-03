import React, { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, PieChart, Shield, Target, AlertTriangle, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Theme, themes } from '../../../../../lib/theme';
import { analysisService, authService } from '../../../../../lib/services';
import type { PortfolioAnalysis } from '../../../../../lib/services/types';
import { formatCurrency } from '../../../../../lib/types';
import { useCurrency } from '../../../../../lib/context/CurrencyContext';
import toast from 'react-hot-toast';

interface PortfolioAnalysisPanelProps {
  theme: Theme;
  portfolioUuid?: string;
}

const DEMO_USER_ID = 'mock-user-id';

export function PortfolioAnalysisPanel({ theme, portfolioUuid }: PortfolioAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['overview']);
  const { currencyConfig, regionalColors } = useCurrency();

  // 渲染markdown内容的函数
  const renderMarkdownContent = (content: string) => {
    // 简单的markdown渲染，支持基本格式
    return content
      .replace(/### (.*?)(?=\n|$)/g, '<h3 class="text-lg font-semibold mb-3 text-blue-600">$1</h3>')
      .replace(/## (.*?)(?=\n|$)/g, '<h2 class="text-xl font-bold mb-4 text-blue-700">$1</h2>')
      .replace(/# (.*?)(?=\n|$)/g, '<h1 class="text-2xl font-bold mb-4 text-blue-800">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/- (.*?)(?=\n|$)/g, '<li class="ml-4 mb-1">• $1</li>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  };

  const fetchAnalysis = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
        const { data, error } = portfolioUuid 
          ? await analysisService.refreshPortfolioAnalysisByUuid(portfolioUuid)
          : await analysisService.refreshPortfolioAnalysis(DEMO_USER_ID);
        if (error) throw error;
        if (data) {
          setAnalysis(data);
          toast.success('投资组合分析已更新');
        }
      } else {
        setIsLoading(true);
        const { data, error } = portfolioUuid 
          ? await analysisService.getPortfolioAnalysisByUuid(portfolioUuid)
          : await analysisService.getPortfolioAnalysis(DEMO_USER_ID);
        if (error) throw error;
        if (data) setAnalysis(data);
      }
    } catch (error) {
      console.error('Error fetching portfolio analysis:', error);
      toast.error('获取分析数据失败');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [portfolioUuid]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'bullish': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'bearish': return <TrendingDown className="w-5 h-5 text-red-500" />;
      default: return <PieChart className="w-5 h-5 text-gray-500" />;
    }
  };

  const getValueColor = (value: number) => {
    if (value > 0) return `text-[${regionalColors.upColor}]`;
    if (value < 0) return `text-[${regionalColors.downColor}]`;
    return themes[theme].text;
  };

  // 如果有content字段，优先显示markdown内容
  if (analysis && analysis.content) {
    return (
      <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className={`text-xl font-bold ${themes[theme].text}`}>
                智能分析报告
              </h2>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>
                分析时间: {new Date(analysis.analysis_time).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => fetchAnalysis(true)}
              disabled={isRefreshing}
              className={`p-2 rounded-md ${themes[theme].secondary} ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-blue-500" />
            <h3 className={`text-lg font-semibold ${themes[theme].text}`}>分析报告</h3>
          </div>
          <div 
            className={`prose prose-sm max-w-none ${themes[theme].text}`}
            dangerouslySetInnerHTML={{ 
              __html: renderMarkdownContent(analysis.content) 
            }}
            style={{
              lineHeight: '1.6',
              color: theme === 'dark' ? '#e5e7eb' : '#374151'
            }}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-6`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${themes[theme].text}`}>正在分析投资组合...</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={`${themes[theme].card} rounded-lg p-6`}>
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className={`${themes[theme].text} mb-4`}>无法获取投资组合分析数据</p>
          <button
            onClick={() => fetchAnalysis()}
            className={`px-4 py-2 rounded-md ${themes[theme].primary}`}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'buy': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'sell': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';
    }
  };

  const sections = [
    {
      id: 'overview',
      title: '整体表现',
      icon: <TrendingUp className="w-5 h-5 text-blue-500" />,
      content: (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className={`text-lg font-semibold ${getValueColor(analysis.overall_metrics.total_return)}`}>
              {analysis.overall_metrics.total_return >= 0 ? '+' : ''}{analysis.overall_metrics.total_return.toFixed(2)}%
            </p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>总收益率</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-semibold ${getValueColor(analysis.overall_metrics.annualized_return)}`}>
              {analysis.overall_metrics.annualized_return >= 0 ? '+' : ''}{analysis.overall_metrics.annualized_return.toFixed(2)}%
            </p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>年化收益</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-semibold ${themes[theme].text}`}>
              {analysis.overall_metrics.volatility.toFixed(1)}%
            </p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>波动率</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-semibold ${themes[theme].text}`}>
              {analysis.overall_metrics.sharpe_ratio.toFixed(2)}
            </p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>夏普比率</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-semibold ${themes[theme].text}`}>
              {analysis.overall_metrics.max_drawdown.toFixed(1)}%
            </p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>最大回撤</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-semibold ${themes[theme].text}`}>
              {analysis.overall_metrics.win_rate.toFixed(1)}%
            </p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>胜率</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-semibold ${themes[theme].text}`}>
              {analysis.overall_metrics.profit_factor.toFixed(2)}
            </p>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>盈亏比</p>
          </div>
        </div>
      )
    },
    {
      id: 'sectors',
      title: '行业配置',
      icon: <PieChart className="w-5 h-5 text-green-500" />,
      content: (
        <div className="space-y-3">
          {analysis.sector_allocation.map((sector, index) => (
            <div key={index} className={`${themes[theme].background} rounded-lg p-3`}>
              <div className="flex justify-between items-center mb-2">
                <span className={`font-medium ${themes[theme].text}`}>{sector.sector}</span>
                <span className={`text-sm ${themes[theme].text} opacity-75`}>
                  {sector.weight.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={`${getValueColor(sector.return)}`}>
                  收益: {sector.return >= 0 ? '+' : ''}{sector.return.toFixed(2)}%
                </span>
                <span className={`${themes[theme].text} opacity-75`}>
                  风险贡献: {sector.risk_contribution.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )
    },
    {
      id: 'risk',
      title: '风险分析',
      icon: <Shield className="w-5 h-5 text-orange-500" />,
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="text-center">
              <p className={`text-lg font-semibold ${themes[theme].text}`}>
                {analysis.risk_analysis.portfolio_beta.toFixed(2)}
              </p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>组合Beta</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-semibold ${themes[theme].text}`}>
                {analysis.risk_analysis.var_95.toFixed(1)}%
              </p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>VaR (95%)</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-semibold ${themes[theme].text}`}>
                {analysis.risk_analysis.concentration_risk.toFixed(1)}%
              </p>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>集中度风险</p>
            </div>
          </div>
          <div>
            <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>相关性矩阵</h4>
            <div className="space-y-2">
              {analysis.risk_analysis.correlation_matrix.slice(0, 3).map((corr, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className={`${themes[theme].text} opacity-75`}>
                    {corr.stock1} - {corr.stock2}
                  </span>
                  <span className={`${themes[theme].text}`}>
                    {corr.correlation.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'rebalancing',
      title: '再平衡建议',
      icon: <Target className="w-5 h-5 text-purple-500" />,
      content: (
        <div className="space-y-3">
          {analysis.rebalancing_suggestions.map((suggestion, index) => (
            <div key={index} className={`${themes[theme].background} rounded-lg p-3`}>
              <div className="flex justify-between items-center mb-2">
                <span className={`font-medium ${themes[theme].text}`}>{suggestion.stock_code}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(suggestion.action)}`}>
                  {suggestion.action === 'buy' ? '买入' : suggestion.action === 'sell' ? '卖出' : '持有'}
                </span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className={`${themes[theme].text} opacity-75`}>
                  当前权重: {suggestion.current_weight.toFixed(1)}%
                </span>
                <span className={`${themes[theme].text} opacity-75`}>
                  建议权重: {suggestion.suggested_weight.toFixed(1)}%
                </span>
              </div>
              <p className={`text-sm ${themes[theme].text} opacity-75`}>{suggestion.reason}</p>
            </div>
          ))}
        </div>
      )
    },
    {
      id: 'outlook',
      title: '市场展望',
      icon: getTrendIcon(analysis.market_outlook.trend),
      content: (
        <div className="space-y-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              {getTrendIcon(analysis.market_outlook.trend)}
              <span className={`text-lg font-semibold ${themes[theme].text}`}>
                {analysis.market_outlook.trend === 'bullish' ? '看涨' : 
                 analysis.market_outlook.trend === 'bearish' ? '看跌' : '中性'}
              </span>
            </div>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>
              置信度: {analysis.market_outlook.confidence.toFixed(0)}% | 
              时间范围: {analysis.market_outlook.time_horizon}
            </p>
          </div>
          <div>
            <h4 className={`text-sm font-medium ${themes[theme].text} mb-2`}>关键因素</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {analysis.market_outlook.key_factors.map((factor, index) => (
                <div key={index} className={`${themes[theme].background} rounded p-2 text-sm ${themes[theme].text}`}>
                  {factor}
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className={`${themes[theme].card} rounded-lg shadow-md overflow-hidden`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className={`text-xl font-bold ${themes[theme].text}`}>
              投资组合分析
            </h2>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>
              分析时间: {new Date(analysis.analysis_time).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => fetchAnalysis(true)}
            disabled={isRefreshing}
            className={`p-2 rounded-md ${themes[theme].secondary} ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {sections.map((section) => (
          <div key={section.id}>
            <button
              onClick={() => toggleSection(section.id)}
              className={`w-full p-4 flex items-center justify-between ${themes[theme].cardHover} transition-colors`}
            >
              <div className="flex items-center gap-3">
                {section.icon}
                <span className={`font-medium ${themes[theme].text}`}>{section.title}</span>
              </div>
              {expandedSections.includes(section.id) ? (
                <ChevronUp className={`w-5 h-5 ${themes[theme].text}`} />
              ) : (
                <ChevronDown className={`w-5 h-5 ${themes[theme].text}`} />
              )}
            </button>
            {expandedSections.includes(section.id) && (
              <div className="p-4 pt-0">
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}