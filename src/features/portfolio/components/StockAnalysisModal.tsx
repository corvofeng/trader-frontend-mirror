import React, { useState, useEffect } from 'react';
import { X, RefreshCw, TrendingUp, TrendingDown, Minus, Target, Shield, Brain, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Theme, themes } from '../../../shared/constants/theme';
import { analysisService } from '../../../lib/services';
import type { StockAnalysis } from '../../../lib/services/types';
import { formatCurrency } from '../../../shared/constants/currency';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import toast from 'react-hot-toast';

interface StockAnalysisModalProps {
  stockCode: string;
  stockName: string;
  theme: Theme;
  onClose: () => void;
}

export function StockAnalysisModal({ stockCode, stockName, theme, onClose }: StockAnalysisModalProps) {
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { currencyConfig, regionalColors } = useCurrency();

  const fetchAnalysis = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
        const { data, error } = await analysisService.refreshStockAnalysis(stockCode);
        if (error) throw error;
        if (data) {
          setAnalysis(data);
          toast.success('分析数据已更新');
        }
      } else {
        setIsLoading(true);
        const { data, error } = await analysisService.getStockAnalysis(stockCode);
        if (error) throw error;
        if (data) setAnalysis(data);
      }
    } catch (error) {
      console.error('Error fetching stock analysis:', error);
      toast.error('获取分析数据失败');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [stockCode]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'bullish': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'bearish': return <TrendingDown className="w-5 h-5 text-red-500" />;
      default: return <Minus className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'bullish': return 'text-green-600';
      case 'bearish': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'buy': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'sell': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'buy': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'sell': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`${themes[theme].card} rounded-lg p-8 max-w-md w-full mx-4`}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className={`${themes[theme].text}`}>正在分析 {stockCode}...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className={`${themes[theme].card} rounded-lg p-8 max-w-md w-full mx-4`}>
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className={`${themes[theme].text} mb-4`}>无法获取分析数据</p>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-md ${themes[theme].primary}`}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themes[theme].card} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-inherit border-b border-gray-200 p-6 flex justify-between items-center">
          <div>
            <h2 className={`text-2xl font-bold ${themes[theme].text}`}>
              {stockCode} - {stockName}
            </h2>
            <p className={`text-sm ${themes[theme].text} opacity-75`}>
              分析时间: {new Date(analysis.analysis_time).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAnalysis(true)}
              disabled={isRefreshing}
              className={`p-2 rounded-md ${themes[theme].secondary} ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-md ${themes[theme].secondary}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 技术分析 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>技术分析</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  {getTrendIcon(analysis.technical_analysis.trend)}
                  <span className={`font-medium ${getTrendColor(analysis.technical_analysis.trend)}`}>
                    {analysis.technical_analysis.trend === 'bullish' ? '看涨' : 
                     analysis.technical_analysis.trend === 'bearish' ? '看跌' : '中性'}
                  </span>
                </div>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>整体趋势</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.technical_analysis.rsi.toFixed(1)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>RSI</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  {getSignalIcon(analysis.technical_analysis.macd.signal)}
                  <span className={`font-medium ${themes[theme].text}`}>
                    {analysis.technical_analysis.macd.signal === 'buy' ? '买入' : 
                     analysis.technical_analysis.macd.signal === 'sell' ? '卖出' : '持有'}
                  </span>
                </div>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>MACD信号</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>支撑位</p>
                <p className={`font-semibold ${themes[theme].text}`}>
                  {formatCurrency(analysis.technical_analysis.support_level, currencyConfig)}
                </p>
              </div>
              <div>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>阻力位</p>
                <p className={`font-semibold ${themes[theme].text}`}>
                  {formatCurrency(analysis.technical_analysis.resistance_level, currencyConfig)}
                </p>
              </div>
              <div>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>MA20</p>
                <p className={`font-semibold ${themes[theme].text}`}>
                  {formatCurrency(analysis.technical_analysis.moving_averages.ma20, currencyConfig)}
                </p>
              </div>
              <div>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>MA50</p>
                <p className={`font-semibold ${themes[theme].text}`}>
                  {formatCurrency(analysis.technical_analysis.moving_averages.ma50, currencyConfig)}
                </p>
              </div>
            </div>
          </div>

          {/* 基本面分析 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-green-500" />
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>基本面分析</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.fundamental_analysis.pe_ratio.toFixed(1)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>P/E</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.fundamental_analysis.pb_ratio.toFixed(2)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>P/B</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.fundamental_analysis.dividend_yield.toFixed(2)}%
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>股息率</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.fundamental_analysis.revenue_growth.toFixed(1)}%
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>营收增长</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.fundamental_analysis.profit_margin.toFixed(1)}%
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>利润率</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {(analysis.fundamental_analysis.market_cap / 1e12).toFixed(2)}T
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>市值</p>
              </div>
            </div>
          </div>

          {/* 情绪分析 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-purple-500" />
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>市场情绪</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {(analysis.sentiment_analysis.score * 100).toFixed(0)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>情绪得分</p>
              </div>
              <div className="text-center">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRatingColor(analysis.sentiment_analysis.news_sentiment)}`}>
                  {analysis.sentiment_analysis.news_sentiment === 'positive' ? '积极' : 
                   analysis.sentiment_analysis.news_sentiment === 'negative' ? '消极' : '中性'}
                </span>
                <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>新闻情绪</p>
              </div>
              <div className="text-center">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRatingColor(analysis.sentiment_analysis.social_sentiment)}`}>
                  {analysis.sentiment_analysis.social_sentiment === 'positive' ? '积极' : 
                   analysis.sentiment_analysis.social_sentiment === 'negative' ? '消极' : '中性'}
                </span>
                <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>社交情绪</p>
              </div>
              <div className="text-center">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRatingColor(analysis.sentiment_analysis.analyst_rating)}`}>
                  {analysis.sentiment_analysis.analyst_rating === 'buy' ? '买入' : 
                   analysis.sentiment_analysis.analyst_rating === 'sell' ? '卖出' : '持有'}
                </span>
                <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>分析师评级</p>
              </div>
            </div>
          </div>

          {/* 风险指标 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-orange-500" />
              <h3 className={`text-lg font-semibold ${themes[theme].text}`}>风险指标</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.risk_metrics.volatility.toFixed(1)}%
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>波动率</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.risk_metrics.beta.toFixed(2)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>Beta</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.risk_metrics.var_95.toFixed(1)}%
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>VaR (95%)</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-semibold ${themes[theme].text}`}>
                  {analysis.risk_metrics.sharpe_ratio.toFixed(2)}
                </p>
                <p className={`text-sm ${themes[theme].text} opacity-75`}>夏普比率</p>
              </div>
            </div>
          </div>

          {/* 投资建议 */}
          <div className={`${themes[theme].background} rounded-lg p-4`}>
            <h3 className={`text-lg font-semibold ${themes[theme].text} mb-4`}>投资建议</h3>
            <div className="space-y-3">
              {analysis.recommendations.map((rec, index) => (
                <div key={index} className={`${themes[theme].card} rounded-lg p-4 border ${themes[theme].border}`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRatingColor(rec.type)}`}>
                      {rec.type === 'buy' ? '买入' : rec.type === 'sell' ? '卖出' : '持有'}
                    </span>
                    <span className={`text-sm ${themes[theme].text} opacity-75`}>
                      置信度: {rec.confidence.toFixed(0)}%
                    </span>
                  </div>
                  <p className={`text-sm ${themes[theme].text} mb-2`}>{rec.reason}</p>
                  {rec.target_price && (
                    <div className="flex gap-4 text-sm">
                      <span className={themes[theme].text}>
                        目标价: {formatCurrency(rec.target_price, currencyConfig)}
                      </span>
                      {rec.stop_loss && (
                        <span className={themes[theme].text}>
                          止损价: {formatCurrency(rec.stop_loss, currencyConfig)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}