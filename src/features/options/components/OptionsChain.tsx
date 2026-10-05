import { useMemo, useState, useEffect } from 'react';
import { format, differenceInDays } from 'date-fns';
import { Theme, themes } from '../../../lib/theme';
import { useCurrency } from '../../../lib/context/CurrencyContext';
import type { OptionsData, OptionsPosition, OptionsStrategy } from '../../../lib/services/types';
import { ExpiryGroupCard } from './ExpiryGroupCard';
import { DEFAULT_QUOTE_COLUMNS } from '../types/tboard';
import { getDaysToExpiryColor, getPositionTypeInfo2, getStatusColorClass, getTypeIcon } from '../utils/portfolioUi';
import { computeCombosForPositions as computeCombosForStrategy } from '../utils/strategyCombos';
import { useOptionPriceWebSocket } from '../hooks/useOptionPriceWebSocket';
import { OptionQuoteSubscription } from './OptionQuoteSubscription';

interface OptionsChainProps {
  theme: Theme;
  optionsData: OptionsData;
  selectedSymbol: string;
  selectedExpiry: string;
  onExpiryChange: (expiry: string) => void;
  selectedAccountId?: string | null;
}

export function OptionsChain({
  theme,
  optionsData,
  selectedSymbol,
  selectedExpiry,
  onExpiryChange,
  selectedAccountId,
}: OptionsChainProps) {
  const { currencyConfig } = useCurrency();
  const { portfolioSnapshot, prices } = useOptionPriceWebSocket();
  const [isTBoardExpanded, setIsTBoardExpanded] = useState(true);

  const uniqueExpiryDates = useMemo(
    () =>
      Array.from(new Set(optionsData.quotes.map(q => q.expiry)))
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    [optionsData.quotes]
  );

  const currentExpiry = selectedExpiry || uniqueExpiryDates[0] || '';

  useEffect(() => {
    if (!selectedExpiry && uniqueExpiryDates.length > 0) {
      onExpiryChange(uniqueExpiryDates[0]);
    }
  }, [selectedExpiry, uniqueExpiryDates, onExpiryChange]);

  // Ensure optionsData has opt_undl_code_full matching selectedSymbol so ExpiryGroupCard filters correctly
  const enrichedOptionsData = useMemo(() => {
    if (!optionsData) return optionsData;
    return {
      ...optionsData,
      opt_undl_code_full: optionsData.opt_undl_code_full || selectedSymbol,
    };
  }, [optionsData, selectedSymbol]);

  // Find user positions for this expiry if any exist in the portfolio
  const matchingPositions = useMemo(() => {
    if (!portfolioSnapshot) return [];
    const allPositions: OptionsPosition[] = [
      ...(portfolioSnapshot.expiryBuckets || []).flatMap(b => b.single),
      ...(portfolioSnapshot.expiryGroups || []).flatMap(g => g.positions),
      ...(portfolioSnapshot.singleLegPositions || []),
    ];
    return allPositions.filter(
      p =>
        p.expiry === currentExpiry &&
        (!selectedSymbol || p.opt_undl_code_full === selectedSymbol || p.symbol === selectedSymbol)
    );
  }, [portfolioSnapshot, currentExpiry, selectedSymbol]);

  const matchingStrategies = useMemo(() => {
    if (!portfolioSnapshot) return [];
    const allStrategies: OptionsStrategy[] = [
      ...(portfolioSnapshot.expiryBuckets || []).flatMap(b => b.complex),
      ...(portfolioSnapshot.strategies || []),
    ];
    return allStrategies.filter(s => s.positions?.some(p => p.expiry === currentExpiry));
  }, [portfolioSnapshot, currentExpiry]);

  const dte = currentExpiry
    ? Math.max(0, differenceInDays(new Date(currentExpiry), new Date()))
    : 0;

  const group = useMemo(
    () => ({
      expiry: currentExpiry,
      daysToExpiry: dte,
      single: matchingPositions,
      complex: matchingStrategies,
    }),
    [currentExpiry, dte, matchingPositions, matchingStrategies]
  );

  const underlyingPrice = useMemo(() => {
    if (selectedSymbol && prices[selectedSymbol]?.price != null) {
      return prices[selectedSymbol]!.price;
    }
    const cleanSym = selectedSymbol?.split('.')[0];
    if (cleanSym && prices[cleanSym]?.price != null) {
      return prices[cleanSym]!.price;
    }
    if ((optionsData as any)?.underlyingPrice != null) {
      return Number((optionsData as any).underlyingPrice);
    }
    if ((optionsData as any)?.underlying_price != null) {
      return Number((optionsData as any).underlying_price);
    }
    const sample = optionsData.quotes?.find(
      q => (q as any).underlyingPrice != null || (q as any).underlying_price != null
    );
    if (sample) {
      return Number((sample as any).underlyingPrice ?? (sample as any).underlying_price);
    }
    return null;
  }, [selectedSymbol, prices, optionsData]);

  const contractCodes = useMemo(() => {
    if (!optionsData?.quotes) return [];
    const codes: string[] = [];
    optionsData.quotes.forEach(q => {
      if (q.expiry === currentExpiry) {
        if (q.call_contract_code_full) codes.push(q.call_contract_code_full);
        if (q.call_contract_code) codes.push(q.call_contract_code);
        if (q.put_contract_code_full) codes.push(q.put_contract_code_full);
        if (q.put_contract_code) codes.push(q.put_contract_code);
      }
    });
    return Array.from(new Set(codes));
  }, [optionsData?.quotes, currentExpiry]);

  return (
    <div className="space-y-2.5 sm:space-y-3">
      {/* Real-time price websocket subscription for contracts and underlying */}
      <OptionQuoteSubscription
        ordinaryCodes={contractCodes}
        realtimeCodes={selectedSymbol ? [selectedSymbol] : []}
      />

      {/* Expiry selector pills */}
      <div className={`${themes[theme].card} rounded-xl p-2.5 sm:p-3 border ${themes[theme].border} card-subtle-ring`}>
        <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain touch-pan-x no-scrollbar">
          <span className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${themes[theme].text} opacity-75 mr-1`}>
            到期月份:
          </span>
          {uniqueExpiryDates.map(date => {
            const isActive = date === currentExpiry;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onExpiryChange(date)}
                className={[
                  'shrink-0 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm border btn-tactile transition-all duration-150 select-none font-medium',
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : `${themes[theme].secondary} ${themes[theme].text} ${themes[theme].border}`
                ].join(' ')}
                role="tab"
                aria-selected={isActive}
              >
                {format(new Date(date), 'yyyy-MM-dd')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Render the standard T-Board via ExpiryGroupCard */}
      {currentExpiry ? (
        <ExpiryGroupCard
          theme={theme}
          group={group}
          statusFilter="all"
          filterAndSortPositions={(positions) => positions}
          currencyConfig={currencyConfig}
          getDaysToExpiryColor={getDaysToExpiryColor}
          getTypeIcon={getTypeIcon}
          getStatusColor={(status) => getStatusColorClass(theme, status as any)}
          getPositionTypeInfo2={getPositionTypeInfo2}
          computeCombosForPositions={computeCombosForStrategy}
          allExpiryBuckets={portfolioSnapshot?.expiryBuckets || []}
          selectedSymbol={selectedSymbol}
          underlyingPrice={underlyingPrice}
          onClosePositions={async () => {}}
          advisedCombinations={(portfolioSnapshot?.advised_combinations || []).filter(c => c.expiry === currentExpiry)}
          selectedAccountId={selectedAccountId || null}
          optionsData={enrichedOptionsData}
          isExpanded={true}
          onToggleExpand={() => {}}
          isTBoardExpanded={isTBoardExpanded}
          onToggleTBoard={() => setIsTBoardExpanded(prev => !prev)}
          customColumns={DEFAULT_QUOTE_COLUMNS}
          storageKey="options_chain_tboard_cols"
          defaultPreset="quote"
          tBoardTitle="期权链 T型报价"
        />
      ) : (
        <div className={`${themes[theme].card} rounded-xl p-8 border ${themes[theme].border} text-center text-sm opacity-60`}>
          暂无期权链数据
        </div>
      )}
    </div>
  );
}
