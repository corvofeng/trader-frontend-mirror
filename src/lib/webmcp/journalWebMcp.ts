import '@mcp-b/global';
import { accountService, portfolioService, stockService, optionsService } from '../services';
import type { Account } from '../services/types';
import type { JournalTab } from '../../pages/Journal/tabConfig';

export interface WebMcpToolContext {
  userId: string;
  selectedAccountId: string | null;
  activeTab: JournalTab;
  onSelectAccount: (accountId: string) => void;
  onSwitchTab: (tab: JournalTab) => void;
  getAccounts: () => Account[];
}

export interface WebMcpRegistrationResult {
  unregister: () => void;
  toolNames: string[];
}

/**
 * Register WebMCP tools on `document.modelContext` with abort signal support.
 */
export function registerJournalWebMcpTools(
  context: WebMcpToolContext,
  signal?: AbortSignal
): WebMcpRegistrationResult {
  if (typeof document === 'undefined' || !('modelContext' in document)) {
    return { unregister: () => {}, toolNames: [] };
  }

  const modelContext = (document as unknown as { modelContext: {
    registerTool: (
      tool: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        execute: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
      },
      options?: { signal?: AbortSignal }
    ) => Promise<void>;
  } }).modelContext;

  const toolNames: string[] = [
    'journal_list_accounts',
    'journal_select_account',
    'journal_get_portfolio',
    'journal_get_trade_history',
    'journal_get_today_orders',
    'journal_get_orders_by_date',
    'journal_switch_tab',
  ];

  const tools = [
    {
      name: 'journal_list_accounts',
      description: '获取当前可用的交易账户列表及当前选中的账户别名',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const resp = await accountService.getAccounts(context.userId);
          const accounts = resp.data || context.getAccounts() || [];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  current_selected_account: context.selectedAccountId,
                  accounts,
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: err instanceof Error ? err.message : 'Failed to list accounts',
                  current_selected_account: context.selectedAccountId,
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'journal_select_account',
      description: '切换当前页面选中的交易账户（通过账户别名或ID）',
      inputSchema: {
        type: 'object',
        properties: {
          account_alias: {
            type: 'string',
            description: '账户别名或账户ID，例如 "mock-account" 或 "main_account"',
          },
        },
        required: ['account_alias'],
      },
      execute: async (args: Record<string, unknown>) => {
        const alias = typeof args.account_alias === 'string' ? args.account_alias.trim() : '';
        if (!alias) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'account_alias is required' }) }],
          };
        }
        context.onSelectAccount(alias);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Switched selected account to ${alias}`,
                selectedAccountId: alias,
              }),
            },
          ],
        };
      },
    },
    {
      name: 'journal_get_portfolio',
      description: '获取指定或当前账户的持仓数据及快照状态',
      inputSchema: {
        type: 'object',
        properties: {
          account_alias: {
            type: 'string',
            description: '可选，默认为当前选中的账户',
          },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const targetAccount = (typeof args.account_alias === 'string' && args.account_alias.trim())
          ? args.account_alias.trim()
          : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No account selected' }) }],
          };
        }

        try {
          const resp = await portfolioService.getHoldings(targetAccount);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  account_alias: targetAccount,
                  is_snapshot: resp.isSnapshot || false,
                  holdings: resp.data || [],
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch holdings' }) }],
          };
        }
      },
    },
    {
      name: 'journal_get_trade_history',
      description: '获取账户的历史交易记录（支持时间范围和标的代码筛选）',
      inputSchema: {
        type: 'object',
        properties: {
          account_alias: {
            type: 'string',
            description: '可选，默认为当前选中的账户',
          },
          start_date: {
            type: 'string',
            description: '起始日期，格式 YYYY-MM-DD，默认 30 天前',
          },
          end_date: {
            type: 'string',
            description: '结束日期，格式 YYYY-MM-DD，默认今天',
          },
          stock_code: {
            type: 'string',
            description: '可选，股票代码，如 "588000.SH"',
          },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const targetAccount = (typeof args.account_alias === 'string' && args.account_alias.trim())
          ? args.account_alias.trim()
          : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No account selected' }) }],
          };
        }

        const now = new Date();
        const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const defaultEnd = now.toISOString().split('T')[0];
        const start = typeof args.start_date === 'string' ? args.start_date : defaultStart;
        const end = typeof args.end_date === 'string' ? args.end_date : defaultEnd;
        const stockCode = typeof args.stock_code === 'string' ? args.stock_code : undefined;

        try {
          const resp = await portfolioService.getRecentTrades(
            context.userId,
            start,
            end,
            targetAccount,
            stockCode
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  account_alias: targetAccount,
                  start_date: start,
                  end_date: end,
                  total_trades: resp.data?.length || 0,
                  trades: resp.data || [],
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch trade history' }) }],
          };
        }
      },
    },
    {
      name: 'journal_get_today_orders',
      description: '获取账户当日的所有委托及成交订单',
      inputSchema: {
        type: 'object',
        properties: {
          account_alias: {
            type: 'string',
            description: '可选，默认为当前选中的账户',
          },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const targetAccount = (typeof args.account_alias === 'string' && args.account_alias.trim())
          ? args.account_alias.trim()
          : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No account selected' }) }],
          };
        }

        try {
          const resp = await stockService.getTodayOrders(targetAccount);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  account_alias: targetAccount,
                  total_orders: resp.data?.length || 0,
                  orders: resp.data || [],
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch today orders' }) }],
          };
        }
      },
    },
    {
      name: 'journal_get_orders_by_date',
      description: '按指定日期查询账户的历史成交及委托订单明细',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日期，格式 YYYY-MM-DD，如 "2026-09-05"',
          },
          account_alias: {
            type: 'string',
            description: '可选，默认为当前选中的账户',
          },
        },
        required: ['date'],
      },
      execute: async (args: Record<string, unknown>) => {
        const targetAccount = (typeof args.account_alias === 'string' && args.account_alias.trim())
          ? args.account_alias.trim()
          : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No account selected' }) }],
          };
        }

        const date = typeof args.date === 'string' ? args.date.trim() : '';
        if (!date) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'date parameter is required' }) }],
          };
        }

        try {
          const resp = await optionsService.getAdminOrders(targetAccount, { date });
          const orders = resp.data || [];
          const filledCount = orders.filter((o) => {
            const s = (o.order_status_name || '').toUpperCase();
            return s.includes('FILLED') || s.includes('TRADED');
          }).length;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  account_alias: targetAccount,
                  date,
                  total_orders: orders.length,
                  filled_orders: filledCount,
                  orders,
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to fetch orders by date' }) }],
          };
        }
      },
    },
    {
      name: 'journal_switch_tab',
      description: '切换 Journal 页面标签页（portfolio: 投资组合持仓, trades: 交易委托, history: 历史交易记录, orders: 成交订单/订单日历）',
      inputSchema: {
        type: 'object',
        properties: {
          tab: {
            type: 'string',
            enum: ['portfolio', 'trades', 'history', 'orders'],
            description: '目标标签页名称',
          },
        },
        required: ['tab'],
      },
      execute: async (args: Record<string, unknown>) => {
        const tab = args.tab as JournalTab;
        if (!['portfolio', 'trades', 'history', 'orders'].includes(tab)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Invalid tab: ${tab}` }) }],
          };
        }
        context.onSwitchTab(tab);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Switched journal tab to ${tab}`,
                activeTab: tab,
              }),
            },
          ],
        };
      },
    },
  ];

  for (const tool of tools) {
    void modelContext.registerTool(tool, { signal }).catch((err) => {
      console.warn(`[WebMCP] Failed to register tool ${tool.name}:`, err);
    });
  }

  return {
    unregister: () => {
      // In WebMCP standard, passing an AbortSignal to registerTool auto-unregisters when aborted.
    },
    toolNames,
  };
}
