import { describe, it, expect, beforeEach, vi } from 'vitest';
import { portfolioService } from '../stockServices';

describe('portfolioService.getHoldings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle legacy array response', async () => {
    const mockHoldings = [{ stock_code: 'AAPL', quantity: 10 }];
    const mockJson = vi.fn().mockResolvedValue(mockHoldings);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const result = await portfolioService.getHoldings('user-1');

    expect(result.data).toEqual(mockHoldings);
    expect(result.error).toBeNull();
    expect(result.isSnapshot).toBe(false);
  });

  it('should handle new object response with positions field', async () => {
    const mockPositions = [{ stock_code: 'GOOG', quantity: 5 }];
    const mockResponse = {
      positions: mockPositions,
      is_snapshot: true,
      balance: 1000
    };
    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const result = await portfolioService.getHoldings('user-1');

    expect(result.data).toEqual(mockPositions);
    expect(result.error).toBeNull();
    expect(result.isSnapshot).toBe(true);
  });

  it('should handle new object response with empty positions', async () => {
    const mockResponse = {
      positions: [],
      is_snapshot: true
    };
    const mockJson = vi.fn().mockResolvedValue(mockResponse);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const result = await portfolioService.getHoldings('user-1');

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });
});

describe('portfolioService.getHoldingsByUuid', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });
  
    it('should handle new object response', async () => {
      const mockPositions = [{ stock_code: 'MSFT', quantity: 100 }];
      const mockResponse = {
        positions: mockPositions,
        is_snapshot: false
      };
      const mockJson = vi.fn().mockResolvedValue(mockResponse);
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
      // @ts-expect-error assign global in test
      global.fetch = mockFetch;
  
      const result = await portfolioService.getHoldingsByUuid('uuid-123');
  
      expect(result.data).toEqual(mockPositions);
      expect(result.error).toBeNull();
    });
});

describe('accountService.getAdminAccountsStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract last_trading_day from root object and propagate to items and meta', async () => {
    const { accountService } = await import('../stockServices');
    const mockResponse = {
      status: 'success',
      last_trading_day: '2026-09-04',
      data: [
        {
          account_id_alias: 'main_zjcf_qmt',
          alias: '中金账户QMT',
          status: 'connected',
          last_snapshot_at: '2026-09-04 15:00:00'
        }
      ]
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue(mockResponse),
    });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const result = await accountService.getAdminAccountsStatus();

    expect(result.error).toBeNull();
    expect(result.meta).toEqual({ last_trading_day: '2026-09-04' });
    expect(result.data?.[0].last_trading_day).toBe('2026-09-04');
  });
});

