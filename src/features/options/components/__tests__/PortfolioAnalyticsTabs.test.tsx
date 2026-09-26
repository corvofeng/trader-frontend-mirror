import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CurrencyProvider } from '../../../../lib/context/CurrencyContext';
import { PortfolioAnalyticsTabs } from '../PortfolioAnalyticsTabs';
import type { CurrencyConfig } from '../../../../shared/types/ui';

describe('PortfolioAnalyticsTabs', () => {
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
  ];

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return renderToString(
      <MemoryRouter>
        <CurrencyProvider>
          {ui}
        </CurrencyProvider>
      </MemoryRouter>
    );
  };

  it('renders both history and subject tabs when subject positions are present', () => {
    const html = renderWithProviders(
      <PortfolioAnalyticsTabs
        theme="dark"
        accountAlias="gjzq_option"
        subjectPositions={mockPositions}
        currencyConfig={mockCurrency}
        defaultExpanded={false}
      />
    );

    expect(html).toContain('历史盈亏走势');
    expect(html).toContain('标的物持仓');
  });

  it('renders only history tab when subject positions are empty', () => {
    const html = renderWithProviders(
      <PortfolioAnalyticsTabs
        theme="light"
        accountAlias="gjzq_option"
        subjectPositions={[]}
        currencyConfig={mockCurrency}
        defaultExpanded={false}
      />
    );

    expect(html).toContain('历史盈亏走势');
    expect(html).not.toContain('标的物持仓');
  });

  it('renders active tab content when expanded', () => {
    const html = renderWithProviders(
      <PortfolioAnalyticsTabs
        theme="dark"
        accountAlias="gjzq_option"
        subjectPositions={mockPositions}
        currencyConfig={mockCurrency}
        defaultTab="subject"
        defaultExpanded={true}
      />
    );

    expect(html).toContain('可用');
    expect(html).toContain('备兑');
    expect(html).toContain('588000.SH');
  });

  it('renders overview tab and data when portfolioData is provided', () => {
    const mockPortfolioData = {
      account_id: 'gjzq_option',
      balance: 150000,
      available: 100000,
      position_profit: 495.2,
      real_used_margin: 45000,
      positions: [],
      subject_positions: mockPositions,
      advised_combinations: [],
      total_margin: 45000,
    };

    const html = renderWithProviders(
      <PortfolioAnalyticsTabs
        theme="dark"
        accountAlias="gjzq_option"
        portfolioData={mockPortfolioData as any}
        currencyConfig={mockCurrency}
        defaultTab="overview"
        defaultExpanded={true}
      />
    );

    expect(html).toContain('组合概览');
    expect(html).toContain('历史走势');
    expect(html).toContain('标的持仓');
    expect(html).toContain('150,000.00');
    expect(html).toContain('495.20');
  });
});

