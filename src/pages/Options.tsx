import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, TrendingUp, Briefcase, Calculator } from 'lucide-react';
import { Theme, themes } from '../lib/theme';
import { OptionsChain } from '../features/options/components/OptionsChain';
import { TimeValueChart } from '../features/options/components/TimeValueChart';
import { VolatilitySurface } from '../features/options/components/VolatilitySurface';
import { OptionsPortfolio } from '../features/options/components/OptionsPortfolio';
import { OptionsTradePlans } from '../features/options/components/OptionsTradePlans';
import { OptionsCalculatorCard } from '../features/options/components/OptionsCalculatorCard';
import { OptionsCalculatorModal } from './options/OptionsCalculatorModal';
import { RelatedLinks } from '../shared/components';
import { optionsService } from '../lib/services';
import { OptionsPortfolioManagement } from '../features/options/components/OptionsPortfolioManagement';
import type { OptionsData } from '../lib/services/types';

interface OptionsProps {
  theme: Theme;
}

type OptionsTab = 'data' | 'portfolio' | 'trading' | 'management';

export function Options({ theme }: OptionsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<OptionsTab>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as OptionsTab;
    return tab && ['data', 'portfolio', 'trading', 'management'].includes(tab) ? tab : 'data';
  });

  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('SPY');
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);

  const handleTabChange = (newTab: OptionsTab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    navigate(`/options?${params.toString()}`, { replace: true });
  };

  // Fetch available symbols on component mount
  React.useEffect(() => {
    const fetchAvailableSymbols = async () => {
      try {
        setIsLoadingSymbols(true);
        const { data, error } = await optionsService.getAvailableSymbols();
        
        if (error) {
          throw error;
        }
        
        if (data && data.length > 0) {
          setAvailableSymbols(data);
          setSelectedSymbol(data[0]); // Set first symbol as default
        }
      } catch (err) {
        console.error('Error fetching available symbols:', err);
        // Fallback to default symbols if API fails
        const fallbackSymbols = ['SPY', 'QQQ', 'AAPL', 'TSLA'];
        setAvailableSymbols(fallbackSymbols);
        setSelectedSymbol(fallbackSymbols[0]);
      } finally {
        setIsLoadingSymbols(false);
      }
    };

    fetchAvailableSymbols();
  }, []);

  // Fetch options data when selected symbol changes (only for data tab)
  React.useEffect(() => {
    const fetchOptionsData = async () => {
      if (!selectedSymbol || activeTab !== 'data') return;
      
      try {
        setIsLoading(true);
        setError(null);
        const { data, error } = await optionsService.getOptionsData(selectedSymbol);
        
        if (error) {
          throw error;
        }
        
        if (data) {
          setOptionsData(data);
          // Set the first expiry date as default
          const uniqueExpiryDates = Array.from(new Set(data.quotes.map(q => q.expiry)))
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
          if (uniqueExpiryDates.length > 0) {
            setSelectedExpiry(uniqueExpiryDates[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching options data:', err);
        setError(err instanceof Error ? err.message : `Failed to load options data for ${selectedSymbol}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOptionsData();
  }, [selectedSymbol, activeTab]);

  const tabs = [
    { id: 'data' as OptionsTab, name: 'Options Data', icon: BarChart2 },
    { id: 'portfolio' as OptionsTab, name: 'Portfolio', icon: Briefcase },
    { id: 'trading' as OptionsTab, name: 'Trade Plans', icon: TrendingUp },
    { id: 'management' as OptionsTab, name: 'Portfolio Management', icon: Calculator },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className={`${themes[theme].card} rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${themes[theme].text}`}>
                Options Trading Analysis
              </h1>
              <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
                Advanced options analysis and trading tools
              </p>
            </div>
            {activeTab === 'data' && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className={`text-sm font-medium ${themes[theme].text}`}>
                    Symbol:
                  </label>
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    disabled={isLoading || isLoadingSymbols}
                    className={`px-3 py-2 rounded-md text-sm ${themes[theme].input} ${themes[theme].text} ${
                      isLoading || isLoadingSymbols ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {availableSymbols.map(symbol => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                  </select>
                </div>
                {(isLoading || isLoadingSymbols) && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex space-x-2 min-w-max sm:min-w-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`inline-flex items-center px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                    activeTab === tab.id
                      ? themes[theme].primary
                      : themes[theme].secondary
                  }`}
                >
                  <Icon className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {(isLoading || isLoadingSymbols) && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">
                  {isLoadingSymbols ? 'Loading available symbols...' : `Loading options data for ${selectedSymbol}...`}
                </p>
              </div>
            )}

            {error && (
              <div className="text-center py-12">
                <div className="text-red-500 mb-4">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-4">{error}</p>
                <button
                  onClick={() => setSelectedSymbol(selectedSymbol)} // Trigger re-fetch
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !isLoadingSymbols && !error && optionsData && (
              <>
                <OptionsChain
                  theme={theme}
                  optionsData={optionsData}
                  selectedSymbol={selectedSymbol}
                  selectedExpiry={selectedExpiry}
                  onExpiryChange={setSelectedExpiry}
                />

                <OptionsCalculatorCard
                  theme={theme}
                  onOpenCalculator={() => setShowCalculatorModal(true)}
                />

                <TimeValueChart
                  theme={theme}
                  optionsData={optionsData}
                  selectedSymbol={selectedSymbol}
                />

                <VolatilitySurface
                  theme={theme}
                  optionsData={optionsData}
                  selectedSymbol={selectedSymbol}
                />
              </>
            )}

            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=data" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="space-y-6">
            <OptionsPortfolio theme={theme} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=portfolio" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'trading' && (
          <div className="space-y-6">
            <OptionsTradePlans theme={theme} selectedSymbol={selectedSymbol} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=trading" 
              maxItems={4}
            />
          </div>
        )}

        {activeTab === 'management' && (
          <div className="space-y-6">
            <OptionsPortfolioManagement theme={theme} />
            <RelatedLinks 
              theme={theme}
              currentPath="/options?tab=management" 
              maxItems={4}
            />
          </div>
        )}
      </div>

      {/* Options Calculator Modal */}
      {showCalculatorModal && (
        <OptionsCalculatorModal
          theme={theme}
          optionsData={optionsData}
          selectedSymbol={selectedSymbol}
          onClose={() => setShowCalculatorModal(false)}
        />
      )}
    </div>
  );
}