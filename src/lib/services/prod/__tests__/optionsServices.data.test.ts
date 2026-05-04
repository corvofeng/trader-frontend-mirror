import { describe, it, expect, vi, beforeEach } from 'vitest';
import { optionsService } from '../optionsServices';

describe('optionsService.getOptionsData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch from internal URL and handle missing surface data', async () => {
    const mockSymbol = '588000.SH';
    const mockInternalData = {
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

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/options')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockInternalData)
        });
      }
      return Promise.reject(new Error('Unexpected url: ' + url));
    });

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await optionsService.getOptionsData(mockSymbol);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/options?symbol=588000.SH')
    );
    expect(result.data).toBeDefined();
    expect(result.data?.quotes).toHaveLength(1);
    expect(result.data?.surface).toEqual([]);
  });
});

describe('optionsService.refreshOptionsData', () => {
  it('should fetch internal endpoint and bypass cache', async () => {
    const mockSymbol = '588000.SH';
    const mockInternalData = {
      quotes: [
        {
          expiry: '2025-01-01',
          strike: 3.5,
          type: 'call',
          last: 0.12,
          bid: 0.11,
          ask: 0.13,
          volume: 101,
          openInterest: 1001
        }
      ],
      surface: [{ expiry: '2025-01-01', strike: 3.5, type: 'call', value: 0.2 }]
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/options')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockInternalData)
        });
      }
      return Promise.reject(new Error('Unexpected url: ' + url));
    });

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await optionsService.refreshOptionsData(mockSymbol);

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/options?symbol=588000.SH'));

    expect(result.error).toBeNull();
    expect(result.data?.quotes).toEqual(mockInternalData.quotes);
    expect(result.data?.surface).toEqual(mockInternalData.surface);
  });
});
