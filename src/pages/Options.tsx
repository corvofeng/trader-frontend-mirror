import React, { useState } from 'react';
import { Theme } from '../lib/theme';
import { OptionsHeader } from './options/components/OptionsHeader';
import { OptionsChain } from './options/components/OptionsChain';
import { OptionsCalculatorCard } from './options/components/OptionsCalculatorCard';
import { TimeValueChart } from './options/components/TimeValueChart';
import { VolatilitySurface } from './options/components/VolatilitySurface';
import { RelatedLinks } from '../components/common/RelatedLinks';
import { OptionsCalculatorModal } from './options/OptionsCalculatorModal';
import { optionsService } from '../lib/services';
import type { OptionsData } from '../lib/services/types';

interface OptionsProps {
  theme: Theme;
}

export function Options({ theme }: OptionsProps) {
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('SPY');
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);

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

  // Fetch options data when selected symbol changes
  React.useEffect(() => {
    const fetchOptionsData = async () => {
      if (!selectedSymbol) return;
      
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
  }, [selectedSymbol]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <OptionsHeader
          theme={theme}
          selectedSymbol={selectedSymbol}
          availableSymbols={availableSymbols}
          isLoading={isLoading || isLoadingSymbols}
          onSymbolChange={setSelectedSymbol}
        />

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
          currentPath="/options" 
          maxItems={4}
        />
      </div>

      {/* 期权计算器弹窗 */}
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