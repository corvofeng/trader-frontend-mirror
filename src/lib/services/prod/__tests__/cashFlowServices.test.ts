import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cashFlowService } from '../stockServices';
import { normalizeTab, ADMIN_TABS, ADMIN_DEFAULT_TAB } from '../../../../shared/utils/tabRouting';

describe('cashFlowService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getCashFlows: should fetch and return items', async () => {
    const mockData = {
      account_alias: 'main_zjcf_qmt',
      items: [
        {
          id: 2,
          amount: '100000.00',
          benefit_note: '发了很多皮肤haha',
          counterparty: '张春秋',
          created_at: '2026-06-15T12:02:49',
          currency: 'CNY',
          description: '手动入金',
          external_id: 'family-gift-20260408-01',
          flow_date: '2026-04-08',
          flow_type: 'deposit',
          source: 'manual',
          updated_at: '2026-09-03T13:52:53'
        }
      ]
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockData })
    });
    // @ts-expect-error test mock
    global.fetch = mockFetch;

    const res = await cashFlowService.getCashFlows('main_zjcf_qmt');
    expect(mockFetch).toHaveBeenCalledWith('/api/accounts/main_zjcf_qmt/cash-flows');
    expect(res.data).toEqual(mockData);
    expect(res.error).toBeNull();
  });

  it('createCashFlow: should post payload and return created item', async () => {
    const payload = {
      flow_date: '2026-04-08',
      flow_type: 'deposit',
      amount: '100000.00',
      currency: 'CNY',
      counterparty: '张春秋',
      description: '手动入金'
    };

    const createdItem = { id: 2, ...payload, created_at: '2026-06-15T12:02:49', updated_at: '2026-06-15T12:02:49' };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: createdItem })
    });
    // @ts-expect-error test mock
    global.fetch = mockFetch;

    const res = await cashFlowService.createCashFlow('main_zjcf_qmt', payload);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/accounts/main_zjcf_qmt/cash-flows',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    );
    expect(res.data).toEqual(createdItem);
    expect(res.error).toBeNull();
  });

  it('updateCashFlow: should patch payload with item id', async () => {
    const payload = {
      description: '修改备注',
      amount: '120000.00'
    };
    const updatedItem = { id: 2, flow_date: '2026-04-08', flow_type: 'deposit', ...payload };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: updatedItem })
    });
    // @ts-expect-error test mock
    global.fetch = mockFetch;

    const res = await cashFlowService.updateCashFlow('main_zjcf_qmt', 2, payload);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/accounts/main_zjcf_qmt/cash-flows/2',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    );
    expect(res.data).toEqual(updatedItem);
  });

  it('deleteCashFlow: should send DELETE request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('')
    });
    // @ts-expect-error test mock
    global.fetch = mockFetch;

    const res = await cashFlowService.deleteCashFlow('main_zjcf_qmt', 2);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/accounts/main_zjcf_qmt/cash-flows/2',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(res.error).toBeNull();
  });
});

describe('tabRouting normalizeTab for cash-flows', () => {
  it('should normalize cash-flows tab correctly', () => {
    expect(normalizeTab(ADMIN_TABS, ADMIN_DEFAULT_TAB, 'cash-flows')).toBe('cash-flows');
    expect(normalizeTab(ADMIN_TABS, ADMIN_DEFAULT_TAB, 'cash_flows')).toBe('cash-flows');
    expect(normalizeTab(ADMIN_TABS, ADMIN_DEFAULT_TAB, 'cash-flow')).toBe('cash-flows');
    expect(normalizeTab(ADMIN_TABS, ADMIN_DEFAULT_TAB, 'cashflow')).toBe('cash-flows');
  });
});
