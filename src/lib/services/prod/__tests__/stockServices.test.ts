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
