import React, { useState } from 'react';
import { logger } from '../../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, TrendingUp, Briefcase, Calculator } from 'lucide-react';
import { OptionsHeader } from './components/OptionsHeader';
import { OptionsTabNavigation } from './components/OptionsTabNavigation';
import { OptionsTabContent } from './components/OptionsTabContent';
import { OptionsCalculatorModal } from '../options/OptionsCalculatorModal';
// import { RelatedLinks } from '../../shared/components';
import { optionsService } from '../../lib/services';
import { Theme } from '../../lib/theme';
import type { OptionsData } from '../../lib/services/types';
import { OptionPriceWebSocketProvider } from '../../features/options/context/OptionPriceWebSocketContext';

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
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
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
        setAvailableSymbols([]);
      } finally {
        setIsLoadingSymbols(false);
      }
    };

    fetchAvailableSymbols();
  }, []);

  // Fetch options data when selected symbol changes (only for data tab)
  React.useEffect(() => {
    const fetchOptionsData = async () => {
      // Allow fetching for 'portfolio' tab as well to support contract code lookup
      if (!selectedSymbol || (activeTab !== 'data' && activeTab !== 'portfolio')) {
        logger.debug('[Pages/Options] Guard: selectedSymbol missing or tab not data/portfolio', {
          selectedSymbol,
          activeTab,
        });
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        const { data, error } = await optionsService.getOptionsData(selectedSymbol);
        
        if (error) {
          throw error;
        }
        
        if (data) {
          setOptionsData(data);
          
          // Update selected symbol if backend returns a canonical one (e.g. 588000 -> 588000.SH)
          if (data.opt_undl_code_full && data.opt_undl_code_full !== selectedSymbol) {
            setSelectedSymbol(data.opt_undl_code_full);
          }

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
    <OptionPriceWebSocketProvider>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <OptionsHeader
            theme={theme}
            selectedSymbol={selectedSymbol}
            availableSymbols={availableSymbols}
            isLoading={isLoading || isLoadingSymbols}
            onSymbolChange={setSelectedSymbol}
            activeTab={activeTab}
          />

          <OptionsTabNavigation
            tabs={tabs}
            activeTab={activeTab}
            theme={theme}
            onTabChange={(tab) => handleTabChange(tab as OptionsTab)}
          />

          <OptionsTabContent
            activeTab={activeTab}
            theme={theme}
            selectedSymbol={selectedSymbol}
            optionsData={optionsData}
            selectedExpiry={selectedExpiry}
            onExpiryChange={setSelectedExpiry}
            isLoading={isLoading}
            isLoadingSymbols={isLoadingSymbols}
            error={error}
            onOpenCalculator={() => setShowCalculatorModal(true)}
            onRetry={() => setSelectedSymbol(selectedSymbol)}
          />
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
    </OptionPriceWebSocketProvider>
  );
}
