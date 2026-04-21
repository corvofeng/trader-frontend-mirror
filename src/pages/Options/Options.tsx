import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../../shared/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, TrendingUp, Briefcase, Calculator, BookOpen } from 'lucide-react';
import { OptionsHeader } from './components/OptionsHeader';
import { OptionsTabNavigation } from './components/OptionsTabNavigation';
import { OptionsTabContent } from './components/OptionsTabContent';
import { OptionsCalculatorModal } from '../options/OptionsCalculatorModal';
// import { RelatedLinks } from '../../shared/components';
import { optionsService } from '../../lib/services';
import { Theme } from '../../lib/theme';
import type { OptionsData } from '../../lib/services/types';
import { OptionPriceWebSocketProvider } from '../../features/options/context/OptionPriceWebSocketContext';
import { useAutoRefresh, useOptionPriceWebSocket } from '../../features/options/hooks/useOptionPriceWebSocket';

interface OptionsProps {
  theme: Theme;
}

type OptionsTab = 'data' | 'portfolio' | 'trading' | 'management' | 'analysis';

export function Options({ theme }: OptionsProps) {
  return (
    <OptionPriceWebSocketProvider>
      <OptionsInner theme={theme} />
    </OptionPriceWebSocketProvider>
  );
}

function OptionsInner({ theme }: OptionsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<OptionsTab>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') as OptionsTab;
    return tab && ['data', 'portfolio', 'trading', 'management', 'analysis'].includes(tab) ? tab : 'data';
  });

  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);

  const { isConnected, queryOptionsData, optionsDataSnapshots } = useOptionPriceWebSocket();

  const handleTabChange = (newTab: OptionsTab) => {
    setActiveTab(newTab);
    const params = new URLSearchParams(location.search);
    params.set('tab', newTab);
    navigate(`/options?${params.toString()}`, { replace: true });
  };

  useEffect(() => {
    const fetchAvailableSymbols = async () => {
      try {
        setIsLoadingSymbols(true);
        const { data, error } = await optionsService.getAvailableSymbols();

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          setAvailableSymbols(data);
          setSelectedSymbol(data[0]);
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

  const fetchOptionsData = useCallback(async () => {
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

        if (data.opt_undl_code_full && data.opt_undl_code_full !== selectedSymbol) {
          setSelectedSymbol(data.opt_undl_code_full);
        }

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
  }, [activeTab, selectedSymbol]);

  useEffect(() => {
    fetchOptionsData();
  }, [fetchOptionsData]);

  const wsSnapshot = useMemo(() => {
    if (!selectedSymbol) return null;
    const direct = optionsDataSnapshots[selectedSymbol];
    if (direct) return direct;
    const byCanonical = Object.values(optionsDataSnapshots).find((d) => d?.opt_undl_code_full === selectedSymbol);
    return byCanonical ?? null;
  }, [optionsDataSnapshots, selectedSymbol]);

  useEffect(() => {
    if (!wsSnapshot) return;
    setOptionsData(wsSnapshot);
    if (wsSnapshot.opt_undl_code_full && wsSnapshot.opt_undl_code_full !== selectedSymbol) {
      setSelectedSymbol(wsSnapshot.opt_undl_code_full);
    }
    if (!wsSnapshot.quotes || wsSnapshot.quotes.length === 0) return;
    const uniqueExpiryDates = Array.from(new Set(wsSnapshot.quotes.map(q => q.expiry)))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    if (uniqueExpiryDates.length === 0) return;
    if (!selectedExpiry || !uniqueExpiryDates.includes(selectedExpiry)) {
      setSelectedExpiry(uniqueExpiryDates[0]);
    }
  }, [selectedExpiry, selectedSymbol, wsSnapshot]);

  const wsCountdownEnabled = isConnected && activeTab === 'data' && !!selectedSymbol;
  const { remainingMs: wsRemainingMs, progress: wsProgress, triggerNow: triggerWsNow } = useAutoRefresh(
    () => {
      if (!selectedSymbol) return;
      queryOptionsData(selectedSymbol);
    },
    {
      enabled: wsCountdownEnabled,
      intervalMs: 10000,
      immediate: true,
      tickMs: 500,
    }
  );

  const canRefreshNow = activeTab === 'data' && !!selectedSymbol;
  const refreshNow = useCallback(() => {
    if (!selectedSymbol) return;
    if (wsCountdownEnabled) {
      triggerWsNow();
      return;
    }
    fetchOptionsData();
  }, [fetchOptionsData, selectedSymbol, triggerWsNow, wsCountdownEnabled]);

  const tabs = [
    { id: 'data' as OptionsTab, name: 'Options Data', icon: BarChart2 },
    { id: 'portfolio' as OptionsTab, name: 'Portfolio', icon: Briefcase },
    { id: 'analysis' as OptionsTab, name: 'Analysis', icon: BookOpen },
    { id: 'trading' as OptionsTab, name: 'Trade Plans', icon: TrendingUp },
    { id: 'management' as OptionsTab, name: 'Portfolio Management', icon: Calculator },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <OptionsHeader
          theme={theme}
          selectedSymbol={selectedSymbol}
          availableSymbols={availableSymbols}
          isLoading={isLoading || isLoadingSymbols}
          onSymbolChange={setSelectedSymbol}
          activeTab={activeTab}
          wsRefresh={{
            canRefreshNow,
            countdownEnabled: wsCountdownEnabled,
            remainingMs: wsRemainingMs,
            progress: wsProgress,
            onRefreshNow: refreshNow,
          }}
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
