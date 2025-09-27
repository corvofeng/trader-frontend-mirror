import React from 'react';
import { StockSearch } from '../../../features/trading';
import type { Stock } from '../../../lib/services/types';

interface StockSearchSectionProps {
  portfolioUuid: string | null;
  onStockSelect: (stock: Stock) => void;
  selectedStockCode?: string;
}

export function StockSearchSection({ 
  portfolioUuid, 
  onStockSelect, 
  selectedStockCode 
}: StockSearchSectionProps) {
  // Only show stock search if not viewing shared portfolio
  if (portfolioUuid) return null;

  return (
    <div className="w-full">
      <StockSearch
        onSelect={onStockSelect}
        selectedStockCode={selectedStockCode}
      />
    </div>
  );
}