import React from 'react';
import { OptionsChain } from '../../../features/options/components/OptionsChain';
import { TimeValueChart } from '../../../features/options/components/TimeValueChart';
import { VolatilitySurface } from '../../../features/options/components/VolatilitySurface';
import { OptionsPortfolio } from '../../../features/options/components/OptionsPortfolio';
import { OptionsTradePlans } from '../../../features/options/components/OptionsTradePlans';
import { OptionsCalculatorCard } from '../../../features/options/components/OptionsCalculatorCard';
import { OptionsPortfolioManagement } from '../../../features/options/components/OptionsPortfolioManagement';
import { RelatedLinks } from '../../../shared/components';
import { Theme } from '../../../lib/theme';
import type { OptionsData } from '../../../lib/services/types';

interface OptionsTabContentProps {
  activeTab: string;
  theme: Theme;
  selectedSymbol: string;
  optionsData: OptionsData | null;
  selectedExpiry: string;
  onExpiryChange: (expiry: string) => void;
  isLoading: boolean;
  isLoadingSymbols: boolean;
  error: string | null;
  onOpenCalculator: () => void;
  onRetry: () => void;
}

export function OptionsTabContent({
  activeTab,
  theme,
  selectedSymbol,
  optionsData,
  selectedExpiry,
  onExpiryChange,
  isLoading,
  isLoadingSymbols,
  error,
  onOpenCalculator,
  onRetry
}: OptionsTabContentProps) {
  if (activeTab === 'data') {
    return (
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
              onClick={onRetry}
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
              onExpiryChange={onExpiryChange}
            />

            <OptionsCalculatorCard
              theme={theme}
              onOpenCalculator={onOpenCalculator}
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
    );
  }

  if (activeTab === 'portfolio') {
    return (
      <div className="space-y-6">
        <OptionsPortfolio theme={theme} />
        <RelatedLinks 
          theme={theme}
          currentPath="/options?tab=portfolio" 
          maxItems={4}
        />
      </div>
    );
  }

  if (activeTab === 'trading') {
    return (
      <div className="space-y-6">
        <OptionsTradePlans theme={theme} selectedSymbol={selectedSymbol} />
        <RelatedLinks 
          theme={theme}
          currentPath="/options?tab=trading" 
          maxItems={4}
        />
      </div>
    );
  }

  if (activeTab === 'management') {
    return (
      <div className="space-y-6">
        <OptionsPortfolioManagement theme={theme} />
        <RelatedLinks 
          theme={theme}
          currentPath="/options?tab=management" 
          maxItems={4}
        />
      </div>
    );
  }

  return null;
}