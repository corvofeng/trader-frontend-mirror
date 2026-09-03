import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SubjectPositionsPanel } from '../SubjectPositionsPanel';
import type { CurrencyConfig } from '../../../../shared/types/ui';

describe('SubjectPositionsPanel', () => {
  const mockCurrency: CurrencyConfig = {
    symbol: '¥',
    position: 'before',
    separator: ',',
    region: 'CN',
  };

  const mockPositions = [
    {
      stock_code: '588000.SH',
      stock_price: 1.25,
      total_stock_price: 125000,
      total_volume: 100000,
      covered_volume: 80000,
      lock_volume: 10000,
    },
    {
      stock_code: '510050.SH',
      stock_price: 2.8,
      total_stock_price: 280000,
      total_volume: 100000,
      covered_volume: 50000,
      lock_volume: 0,
    },
  ];

  it('renders header, title, badges, and icon when expanded', () => {
    const html = renderToString(
      <SubjectPositionsPanel
        theme="dark"
        positions={mockPositions}
        currencyConfig={mockCurrency}
        defaultExpanded={true}
      />
    );

    expect(html).toContain('标的物持仓');
    expect(html).toContain('个标的');
    expect(html).toContain('标的总市值');
    expect(html).toContain('588000.SH');
    expect(html).toContain('510050.SH');
    expect(html).toContain('可用');
    expect(html).toContain('备兑');
    expect(html).toContain('锁定');
  });

  it('renders collapsed state without tables when defaultExpanded is false', () => {
    const html = renderToString(
      <SubjectPositionsPanel
        theme="light"
        positions={mockPositions}
        currencyConfig={mockCurrency}
        defaultExpanded={false}
      />
    );

    expect(html).toContain('标的物持仓');
    expect(html).toContain('个标的');
    expect(html).toContain('标的总市值');
    // Table should not be rendered when collapsed
    expect(html).not.toContain('<table');
  });

  it('returns null when positions array is empty', () => {
    const html = renderToString(
      <SubjectPositionsPanel
        theme="dark"
        positions={[]}
        currencyConfig={mockCurrency}
      />
    );

    expect(html).toBe('');
  });
});
