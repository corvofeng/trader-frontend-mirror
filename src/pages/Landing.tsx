import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, CandlestickChart as ChartCandle, BarChart2, Sun, Moon, DollarSign, ArrowUpCircle, ArrowDownCircle, Briefcase, Sigma } from 'lucide-react';
import { AnimatedChart } from './landing/features/chart';
import { InternalLink } from '../components/common/InternalLink';
import { RelatedLinks } from '../components/common/RelatedLinks';
import { Theme, themes } from '../lib/theme';

interface LandingProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const DEMO_HOLDINGS = [
  {
    stock_code: 'AAPL',
    stock_name: 'Apple Inc.',
    current_price: 175.50,
    profit_loss_percentage: 3.08,
  },
  {
    stock_code: 'MSFT',
    stock_name: 'Microsoft Corporation',
    current_price: 338.20,
    profit_loss_percentage: 8.83,
  },
  {
    stock_code: 'NVDA',
    stock_name: 'NVIDIA Corporation',
    current_price: 445.75,
    profit_loss_percentage: 6.06,
  }
];

export function Landing({ theme, onThemeChange }: LandingProps) {
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  return (
    <div 
      className={`min-h-screen flex flex-col bg-cover bg-center bg-no-repeat ${
        isDark ? 'bg-gray-900' : 'bg-white'
      }`}
      style={{
        backgroundImage: isDark 
          ? `linear-gradient(to bottom, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.8)), url('https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=2070')`
          : `linear-gradient(to bottom, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.8)), url('https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&q=80&w=2070')`
      }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 flex justify-end">
        <button
          onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
          className={`p-2 rounded-full ${isDark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-800'} hover:bg-opacity-90 transition-colors duration-200`}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>
      </div>
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-16">
            <h1 className={`text-4xl sm:text-6xl font-bold mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Track Your Trading Journey
            </h1>
            <p className={`text-xl mb-8 ${isDark ? 'text-gray-200' : 'text-gray-600'}`}>
              Professional tools to analyze, track, and improve your trading performance
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/journal')}
                className="inline-flex items-center px-8 py-4 rounded-lg text-lg font-medium shadow-lg transition-all hover:scale-105 bg-blue-600 text-white hover:bg-blue-700"
              >
                <TrendingUp className="w-6 h-6 mr-2" />
                Start Trading Journal
              </button>
              <button
                onClick={() => navigate('/options')}
                className={`inline-flex items-center px-8 py-4 rounded-lg text-lg font-medium shadow-lg transition-all hover:scale-105 ${
                  isDark ? 'bg-gray-800 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                <Sigma className="w-6 h-6 mr-2" />
                Options Trading
              </button>
            </div>
          </div>

          <div className={`mb-16 ${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-2xl p-6 shadow-xl border ${
            isDark ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="mb-4 flex justify-between items-center">
              <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Market Overview
              </h2>
              <InternalLink
                to="/journal"
                className={`text-blue-500 hover:text-blue-600 flex items-center gap-2 transition-colors`}
                title="Access your complete trading dashboard"
              >
                <span>Open Trading View</span>
                <TrendingUp className="w-5 h-5" />
              </InternalLink>
            </div>
            <AnimatedChart theme={theme} />
          </div>

          <div className="mb-16">
            <div className="flex justify-between items-center mb-8">
              <h2 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Track Your Portfolio Performance
              </h2>
              <InternalLink
                to="/journal?tab=portfolio"
                className={`text-blue-500 hover:text-blue-600 flex items-center gap-2 transition-colors`}
                title="Access detailed portfolio analytics and performance metrics"
              >
                <span>View Full Portfolio</span>
                <ArrowUpCircle className="w-5 h-5" />
              </InternalLink>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {DEMO_HOLDINGS.map((holding) => (
                <div
                  key={holding.stock_code}
                  className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-6 border ${
                    isDark ? 'border-gray-700' : 'border-gray-200'
                  } hover:bg-opacity-100 transition-colors duration-200 shadow-lg`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                        {holding.stock_code}
                      </h3>
                      <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                        {holding.stock_name}
                      </p>
                    </div>
                    {holding.profit_loss_percentage >= 0 ? (
                      <ArrowUpCircle className="w-6 h-6 text-green-500" />
                    ) : (
                      <ArrowDownCircle className="w-6 h-6 text-red-500" />
                    )}
                  </div>
                  <div className="flex justify-between items-baseline">
                    <div className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                      <DollarSign className="w-4 h-4 inline-block" />
                      {holding.current_price.toFixed(2)}
                    </div>
                    <div className={`text-lg font-semibold ${
                      holding.profit_loss_percentage >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {holding.profit_loss_percentage >= 0 ? '+' : ''}{holding.profit_loss_percentage.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-8 shadow-lg border ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="text-blue-500 mb-4">
                <ChartCandle className="w-8 h-8" />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Real-time Tracking
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                Monitor your trades in real-time with advanced charting and analytics
              </p>
            </div>
            <div className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-8 shadow-lg border ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="text-blue-500 mb-4">
                <BarChart2 className="w-8 h-8" />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Performance Analytics
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                Gain insights into your trading patterns and improve your strategy
              </p>
            </div>
            <div className={`${isDark ? 'bg-gray-800/90' : 'bg-white'} rounded-xl p-8 shadow-lg border ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="text-blue-500 mb-4">
                <TrendingUp className="w-8 h-8" />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Trade Journal
              </h3>
              <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                Keep detailed records of your trades with notes and analysis
              </p>
              <div className="mt-4">
                <InternalLink
                  to="/journal?tab=trades"
                  className="text-blue-500 hover:text-blue-600 text-sm font-medium"
                  title="Create and manage your trading plans"
                >
                  Create Trade Plans →
                </InternalLink>
              </div>
            </div>
          </div>

          <div className="mt-16">
            <RelatedLinks 
              theme={isDark ? 'dark' : 'light'} 
              currentPath="/" 
              maxItems={4}
            />
          </div>
        </div>
      </main>
    </div>
  );
}