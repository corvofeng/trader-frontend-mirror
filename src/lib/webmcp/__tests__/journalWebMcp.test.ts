import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { registerJournalWebMcpTools, type WebMcpToolContext } from '../journalWebMcp';
import { accountService, optionsService } from '../../services';
import type { Account } from '../../services/types';

const mockAccount: Account = {
  id: 'acc-1',
  user_id: 'test-user',
  alias: 'main',
  name: 'Main Account',
  is_default: true,
  currency: 'CNY',
  broker: 'MOCK',
  account_no: '123456',
};

describe('Journal WebMCP tools', () => {
  let mockRegisterTool: ReturnType<typeof vi.fn>;
  let registeredTools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }>;

  beforeEach(() => {
    registeredTools = [];
    mockRegisterTool = vi.fn().mockImplementation((tool) => {
      registeredTools.push(tool);
      return Promise.resolve();
    });

    (globalThis as unknown as { document: unknown }).document = {
      modelContext: {
        registerTool: mockRegisterTool,
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('registers all 7 journal WebMCP tools on document.modelContext', () => {
    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      onSelectAccount: vi.fn(),
      onSwitchTab: vi.fn(),
      getAccounts: () => [mockAccount],
    };

    const result = registerJournalWebMcpTools(context);

    expect(result.toolNames).toEqual([
      'journal_list_accounts',
      'journal_select_account',
      'journal_get_portfolio',
      'journal_get_trade_history',
      'journal_get_today_orders',
      'journal_get_orders_by_date',
      'journal_switch_tab',
    ]);
    expect(registeredTools).toHaveLength(7);
  });

  it('executes journal_select_account and triggers context callback', async () => {
    const onSelectAccount = vi.fn();
    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      onSelectAccount,
      onSwitchTab: vi.fn(),
      getAccounts: () => [],
    };

    registerJournalWebMcpTools(context);
    const selectTool = registeredTools.find((t) => t.name === 'journal_select_account');
    expect(selectTool).toBeDefined();

    const res = await selectTool!.execute({ account_alias: 'sub-account' });
    expect(onSelectAccount).toHaveBeenCalledWith('sub-account');
    expect(JSON.parse(res.content[0].text)).toMatchObject({
      success: true,
      selectedAccountId: 'sub-account',
    });
  });

  it('executes journal_switch_tab and triggers context callback', async () => {
    const onSwitchTab = vi.fn();
    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      onSelectAccount: vi.fn(),
      onSwitchTab,
      getAccounts: () => [],
    };

    registerJournalWebMcpTools(context);
    const switchTool = registeredTools.find((t) => t.name === 'journal_switch_tab');
    expect(switchTool).toBeDefined();

    const res = await switchTool!.execute({ tab: 'orders' });
    expect(onSwitchTab).toHaveBeenCalledWith('orders');
    expect(JSON.parse(res.content[0].text)).toMatchObject({
      success: true,
      activeTab: 'orders',
    });
  });

  it('executes journal_list_accounts and returns accounts list', async () => {
    vi.spyOn(accountService, 'getAccounts').mockResolvedValueOnce({
      data: [mockAccount],
      error: null,
    } as never);

    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      onSelectAccount: vi.fn(),
      onSwitchTab: vi.fn(),
      getAccounts: () => [],
    };

    registerJournalWebMcpTools(context);
    const listTool = registeredTools.find((t) => t.name === 'journal_list_accounts');
    const res = await listTool!.execute({});
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.current_selected_account).toBe('acc-1');
    expect(parsed.accounts).toHaveLength(1);
  });

  it('executes journal_get_orders_by_date and returns orders with count', async () => {
    vi.spyOn(optionsService, 'getAdminOrders').mockResolvedValueOnce({
      data: [
        {
          instrument_name: '588000.SH',
          order_status_name: 'FILLED',
          limit_price: 1.05,
          traded_price: 1.05,
          volume_total_original: 100,
          volume_traded: 100,
          order_time: '2026-09-05 09:30:00',
        },
      ],
      error: null,
    } as never);

    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'orders',
      onSelectAccount: vi.fn(),
      onSwitchTab: vi.fn(),
      getAccounts: () => [],
    };

    registerJournalWebMcpTools(context);
    const ordersTool = registeredTools.find((t) => t.name === 'journal_get_orders_by_date');
    const res = await ordersTool!.execute({ date: '2026-09-05' });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.account_alias).toBe('acc-1');
    expect(parsed.total_orders).toBe(1);
    expect(parsed.filled_orders).toBe(1);
  });

  it('rejects journal_switch_tab with AUTH_REQUIRED when unauthenticated user attempts to open orders', async () => {
    const onSwitchTab = vi.fn();
    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      isAuthenticated: false,
      allowedTabs: ['portfolio'],
      onSelectAccount: vi.fn(),
      onSwitchTab,
      getAccounts: () => [mockAccount],
    };

    registerJournalWebMcpTools(context);
    const switchTool = registeredTools.find((t) => t.name === 'journal_switch_tab');
    const res = await switchTool!.execute({ tab: 'orders' });
    const parsed = JSON.parse(res.content[0].text);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('AUTH_REQUIRED');
    expect(parsed.allowed_tabs).toEqual(['portfolio']);
    expect(onSwitchTab).not.toHaveBeenCalled();
  });

  it('rejects journal_get_today_orders and journal_get_trade_history when unauthenticated', async () => {
    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      isAuthenticated: false,
      onSelectAccount: vi.fn(),
      onSwitchTab: vi.fn(),
      getAccounts: () => [mockAccount],
    };

    registerJournalWebMcpTools(context);
    const todayOrdersTool = registeredTools.find((t) => t.name === 'journal_get_today_orders');
    const historyTool = registeredTools.find((t) => t.name === 'journal_get_trade_history');

    const ordersRes = await todayOrdersTool!.execute({});
    const historyRes = await historyTool!.execute({});

    expect(JSON.parse(ordersRes.content[0].text)).toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
    expect(JSON.parse(historyRes.content[0].text)).toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('rejects journal_get_orders_by_date with INVALID_PARAM for malformed date', async () => {
    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      isAuthenticated: true,
      onSelectAccount: vi.fn(),
      onSwitchTab: vi.fn(),
      getAccounts: () => [mockAccount],
    };

    registerJournalWebMcpTools(context);
    const ordersTool = registeredTools.find((t) => t.name === 'journal_get_orders_by_date');
    const res = await ordersTool!.execute({ date: 'not-a-date' });
    const parsed = JSON.parse(res.content[0].text);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('INVALID_PARAM');
  });

  it('returns ACCOUNT_NOT_FOUND when requesting non-existent account', async () => {
    const context: WebMcpToolContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-1',
      activeTab: 'portfolio',
      isAuthenticated: true,
      onSelectAccount: vi.fn(),
      onSwitchTab: vi.fn(),
      getAccounts: () => [mockAccount],
    };

    registerJournalWebMcpTools(context);
    const portfolioTool = registeredTools.find((t) => t.name === 'journal_get_portfolio');
    const res = await portfolioTool!.execute({ account_alias: 'non-existent-account' });
    const parsed = JSON.parse(res.content[0].text);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('ACCOUNT_NOT_FOUND');
  });
});
