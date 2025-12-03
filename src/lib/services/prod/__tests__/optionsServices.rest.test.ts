import { describe, it, expect, beforeEach, vi } from 'vitest';
import { optionsService } from '../optionsServices';
import type { RatioSpreadPlanResult } from '../../types';

describe('optionsService ratio spread plans RESTful URLs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET list without accountId keeps unified prefix and query params', async () => {
    const mockJson = vi.fn().mockResolvedValue([]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const symbol = 'SPY';
    const userId = 'user-1';
    await optionsService.getRatioSpreadPlans(symbol, null, userId);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl.startsWith('/api/options/ratio-spread-plans')).toBe(true);
    expect(calledUrl).toContain('symbol=SPY');
    expect(calledUrl).toContain('userId=user-1');
  });

  it('GET list with accountId places accounts segment at the end', async () => {
    const mockJson = vi.fn().mockResolvedValue([]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const symbol = 'QQQ';
    const accountId = 'acc-123';
    const userId = 'user-2';
    await optionsService.getRatioSpreadPlans(symbol, accountId, userId);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl.startsWith('/api/options/ratio-spread-plans/accounts/acc-123')).toBe(true);
    expect(calledUrl).toContain('symbol=QQQ');
    expect(calledUrl).toContain('userId=user-2');
  });

  it('POST save uses unified prefix and accounts segment at end when provided', async () => {
    const plan: RatioSpreadPlanResult = {
      plan: {
        expiry: '2026-06-24',
        option_type: 'put',
        lower_strike: 1.35,
        upper_strike: 1.4,
        target_spread: 10,
        cover_contracts_needed: 3,
        label: '2026-06-24-put-1.35-1.40'
      },
      current_spread: 0,
      leverage: 4,
      cover_contracts_needed: 3,
      action: 'open',
      reason: 'test',
      best_net_premium: 0.01,
      buy_price: 0.1,
      sell_price: 0.09,
      analysis: {
        strike_type: 'put',
        buy_strike: { code: 'c1', name: 'n1', price: 0.1, option_type: 'put', strike_price: 1.4, expiry: '2026-06-24' },
        sell_strike: { code: 'c2', name: 'n2', price: 0.09, option_type: 'put', strike_price: 1.35, expiry: '2026-06-24' },
        buy_price: 0.1,
        sell_price: 0.09,
        buy_strike_price: 1.4,
        sell_strike_price: 1.35,
        buy_count: 3,
        sell_count: 4,
        best_net_premium: 0.01,
        cover_contracts_needed: 3,
        到期日: '2026-06-24'
      }
    };

    const mockJson = vi.fn().mockResolvedValue(plan);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const accountId = 'acc-abc';
    const userId = 'user-3';
    await optionsService.saveRatioSpreadPlan(plan, accountId, userId);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl.startsWith('/api/options/ratio-spread-plans/accounts/acc-abc')).toBe(true);
    expect(calledUrl).toContain('userId=user-3');
    expect(init?.method).toBe('POST');
  });

  it('PUT refresh targets specific plan resource and accounts segment at end', async () => {
    const plan: RatioSpreadPlanResult = {
      plan: {
        expiry: '2026-06-24',
        option_type: 'call',
        lower_strike: 450,
        upper_strike: 460,
        target_spread: 10,
        cover_contracts_needed: 2,
        label: '2026-06-24-call-450-460'
      },
      current_spread: 0,
      leverage: 2,
      cover_contracts_needed: 2,
      action: 'open',
      reason: 'test',
      best_net_premium: 0.02,
      buy_price: 2,
      sell_price: 1.8,
      analysis: {
        strike_type: 'call',
        buy_strike: { code: 'c3', name: 'n3', price: 2, option_type: 'call', strike_price: 460, expiry: '2026-06-24' },
        sell_strike: { code: 'c4', name: 'n4', price: 1.8, option_type: 'call', strike_price: 450, expiry: '2026-06-24' },
        buy_price: 2,
        sell_price: 1.8,
        buy_strike_price: 460,
        sell_strike_price: 450,
        buy_count: 1,
        sell_count: 2,
        best_net_premium: 0.02,
        cover_contracts_needed: 2,
        到期日: '2026-06-24'
      }
    };

    const mockJson = vi.fn().mockResolvedValue(plan);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: mockJson });
    // @ts-expect-error assign global in test
    global.fetch = mockFetch;

    const accountId = 'acc-xyz';
    const userId = 'user-4';
    await optionsService.refreshRatioSpreadPlan(plan, accountId, userId);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl.startsWith('/api/options/ratio-spread-plans/2026-06-24-call-450-460-2026-06-24/accounts/acc-xyz')).toBe(true);
    expect(calledUrl).toContain('userId=user-4');
    expect(init?.method).toBe('PUT');
  });
});
