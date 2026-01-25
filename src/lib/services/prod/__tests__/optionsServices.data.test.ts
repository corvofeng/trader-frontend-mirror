import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { optionsService } from '../optionsServices';

describe('optionsService.getOptionsData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // @ts-expect-error reset cache
    // Accessing private cache for testing purposes if possible, 
    // or just relying on unique symbols to bypass cache
  });

  it('should fetch from external URL and handle missing surface data', async () => {
    const mockSymbol = '588000.SH';
    const mockExternalData = {
      quotes: [
        {
            expiry: '2025-01-01',
            strike: 3.5,
            type: 'call',
            last: 0.1,
            bid: 0.09,
            ask: 0.11,
            volume: 100,
            openInterest: 1000
        }
      ]
      // surface is missing
    };

    const mockFetch = vi.fn().mockImplementation((url) => {
      if (url.includes('stock.in.corvo.fun')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockExternalData)
        });
      }
      return Promise.reject(new Error('Fallback not expected'));
    });

    global.fetch = mockFetch;

    const result = await optionsService.getOptionsData(mockSymbol);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://stock.in.corvo.fun/api/options?symbol=588000.SH')
    );
    expect(result.data).toBeDefined();
    expect(result.data?.quotes).toHaveLength(1);
    expect(result.data?.surface).toEqual([]);
  });
});
