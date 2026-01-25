import { describe, it, expect, beforeEach, vi } from 'vitest';
import { optionsService } from '../optionsServices';
import type { OptionsPortfolioData } from '../../types';

describe('optionsService.getOptionsPortfolio Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should adapt new backend response format to OptionsPortfolioData', async () => {
    // Mock backend response with flat positions list (new format)
    const mockResponse = {
      positions: [
        {
          id: 'pos-1',
          symbol: 'AAPL',
          type: 'call',
          position_type: 'buy',
          strike: 150,
          expiry: '2025-01-01',
          quantity: 1,
          currentValue: 500,
          profitLoss: 50,
          // ... other fields
        },
        {
          id: 'pos-2',
          symbol: 'AAPL',
          type: 'put',
          position_type: 'sell',
          strike: 140,
          expiry: '2025-02-01',
          quantity: 2,
          currentValue: -200,
          profitLoss: 20,
        }
      ],
      is_snapshot: true,
      balance: 10000,
      real_used_margin: 2000
    };

    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global
    global.fetch = mockFetch;

    const result = await optionsService.getOptionsPortfolio('user-1');

    expect(result.error).toBeNull();
    const data = result.data as OptionsPortfolioData;

    // Verify top-level fields
    expect(data.is_snapshot).toBe(true);
    expect(data.balance).toBe(10000);
    expect(data.real_used_margin).toBe(2000);
    
    // Verify aggregation
    expect(data.totalValue).toBe(300); // 500 - 200
    expect(data.totalProfitLoss).toBe(70); // 50 + 20

    // Verify expiry groups
    expect(data.expiryGroups).toHaveLength(2);
    expect(data.expiryGroups[0].expiry).toBe('2025-01-01');
    expect(data.expiryGroups[0].positions).toHaveLength(1);
    expect(data.expiryGroups[1].expiry).toBe('2025-02-01');
    
    // Verify expiry buckets (used by UI)
    expect(data.expiryBuckets).toBeDefined();
    expect(data.expiryBuckets!.length).toBe(2);
    expect(data.expiryBuckets![0].single).toHaveLength(1);
  });

  it('should handle legacy format correctly', async () => {
    // Mock legacy response (already aggregated)
    const mockLegacyResponse = {
      expiryGroups: [
        {
          expiry: '2025-01-01',
          positions: [],
          totalValue: 100,
          totalCost: 0,
          profitLoss: 0
        }
      ],
      totalValue: 100,
      positions: [] // Might exist but ignored if expiryGroups is present?
    };

    const mockJson = vi.fn().mockResolvedValue(mockLegacyResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global
    global.fetch = mockFetch;

    const result = await optionsService.getOptionsPortfolio('user-1');

    expect(result.data).toEqual(mockLegacyResponse);
  });

  it('should adapt snake_case fields correctly', async () => {
    const mockResponse = {
      positions: [
        {
          id: 'pos-1',
          symbol: 'AAPL',
          type: 'call',
          position_type: 'buy',
          strike: 150,
          expiry: '2025-01-01',
          quantity: 1,
          current_value: 500,
          profit_loss: 50,
        }
      ],
      is_snapshot: true
    };

    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global
    global.fetch = mockFetch;

    const result = await optionsService.getOptionsPortfolio('user-1');
    const data = result.data as OptionsPortfolioData;

    expect(data.totalValue).toBe(500);
    expect(data.totalProfitLoss).toBe(50);
    expect(data.singleLegPositions![0].currentValue).toBe(500);
    expect(data.singleLegPositions![0].profitLoss).toBe(50);
  });

  it('should handle missing expiry by grouping into Unknown', async () => {
    const mockResponse = {
      positions: [
        {
          symbol: 'AAPL',
          type: 'call',
          quantity: 1,
          // no expiry
        }
      ]
    };
    
    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global
    global.fetch = mockFetch;

    const result = await optionsService.getOptionsPortfolio('user-1');
    const data = result.data as OptionsPortfolioData;
    
    expect(data.expiryGroups).toHaveLength(1);
    expect(data.expiryGroups[0].expiry).toBe('Unknown');
    expect(data.expiryGroups[0].positions).toHaveLength(1);
  });

  it('should handle alternative expiry field names', async () => {
    const mockResponse = {
      positions: [
        {
          symbol: 'AAPL',
          quantity: 1,
          expiration: '2025-02-01'
        },
        {
          symbol: 'GOOG',
          quantity: 1,
          expiry_date: '2025-03-01'
        }
      ]
    };
    
    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global
    global.fetch = mockFetch;

    const result = await optionsService.getOptionsPortfolio('user-1');
    const data = result.data as OptionsPortfolioData;
    
    expect(data.expiryGroups).toHaveLength(2);
    expect(data.expiryGroups.map(g => g.expiry)).toEqual(expect.arrayContaining(['2025-02-01', '2025-03-01']));
  });

  it('should handle pre-bucketed backend response', async () => {
    const mockResponse = {
      available: 234609.84,
      balance: 217649.84,
      expiryBuckets: [
        {
          complex: [],
          daysToExpiry: 3,
          expiry: "2026-01-28",
          single: [
            {
              contract_code: "10010512",
              symbol: "科创50沽1月1600",
              quantity: 1,
              premium: 600.0,
              profitLoss: -693.0,
              currentValue: 93.0,
              expiry: "2026-01-28"
            }
          ]
        },
        {
          complex: [
             {
               id: "strategy-1",
               positions: [],
               currentValue: 100,
               totalCost: 50,
               profitLoss: 50
             }
          ],
          expiry: "2026-02-25",
          daysToExpiry: 30,
          single: []
        }
      ]
    };
    
    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global
    global.fetch = mockFetch;

    const result = await optionsService.getOptionsPortfolio('user-1');
    const data = result.data as OptionsPortfolioData;
    
    expect(data.expiryBuckets).toBeDefined();
    expect(data.expiryBuckets).toHaveLength(2);
    expect(data.singleLegPositions).toHaveLength(1);
    expect(data.complexStrategies).toHaveLength(1);
    
    // Check calculated totals
    // Single: 93 val, -693 pl, 600*1*100=60000 cost
    // Complex: 100 val, 50 pl, 50 cost
    // Total Value: 193
    // Total PL: -643
    expect(data.totalValue).toBe(193);
    expect(data.totalProfitLoss).toBe(-643);
    expect(data.balance).toBe(217649.84);
  });

  it('should pass through subject_positions with price info', async () => {
    const mockResponse = {
      positions: [],
      subject_positions: [
        {
          covered_volume: 150000,
          lock_volume: 0,
          stock_code: "588000.SH",
          total_volume: 150000,
          stock_price: 1.234,
          total_stock_price: 185100
        }
      ]
    };
    
    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global
    global.fetch = mockFetch;

    const result = await optionsService.getOptionsPortfolio('user-1');
    const data = result.data as OptionsPortfolioData;
    
    expect(data.subject_positions).toBeDefined();
    expect(data.subject_positions).toHaveLength(1);
    expect(data.subject_positions![0].stock_code).toBe("588000.SH");
    expect(data.subject_positions![0].total_volume).toBe(150000);
    expect(data.subject_positions![0].stock_price).toBe(1.234);
    expect(data.subject_positions![0].total_stock_price).toBe(185100);
  });
});
