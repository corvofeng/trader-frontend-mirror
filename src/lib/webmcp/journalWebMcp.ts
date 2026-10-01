import '@mcp-b/global';
import { accountService, portfolioService, stockService, optionsService } from '../services';
import type { Account } from '../services/types';
import type { JournalTab } from '../../pages/Journal/tabConfig';
import type { WebMcpToolDescriptor } from './landingWebMcp';

export interface WebMcpToolContext {
  userId: string;
  selectedAccountId: string | null;
  activeTab: JournalTab;
  isAuthenticated?: boolean;
  allowedTabs?: readonly JournalTab[];
  onSelectAccount: (accountId: string) => void;
  onSwitchTab: (tab: JournalTab) => void;
  getAccounts: () => Account[];
}

export interface WebMcpRegistrationResult {
  unregister: () => void;
  toolNames: string[];
  tools: WebMcpToolDescriptor[];
  registrationPromise: Promise<number>;
}

function isValidDateString(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [year, month, day] = trimmed.split('-').map(Number);
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function validateAccountExistence(targetAccount: string, accounts: Account[]): boolean {
  if (!accounts || accounts.length === 0) return true;
  const norm = targetAccount.trim().toLowerCase();
  return accounts.some(
    (acc) =>
      (acc.alias && acc.alias.trim().toLowerCase() === norm) ||
      (acc.id && acc.id.trim().toLowerCase() === norm)
  );
}

/**
 * Register WebMCP tools on `document.modelContext` with abort signal support.
 */
export function registerJournalWebMcpTools(
  context: WebMcpToolContext,
  signal?: AbortSignal
): WebMcpRegistrationResult {
  const modelContext =
    (typeof document !== 'undefined' && (document as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof window !== 'undefined' && (window as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof navigator !== 'undefined' && (navigator as unknown as { modelContext?: unknown }).modelContext);

  const toolNames: string[] = [
    'journal_list_accounts',
    'journal_select_account',
    'journal_get_portfolio',
    'journal_get_trade_history',
    'journal_get_today_orders',
    'journal_get_orders_by_date',
    'journal_switch_tab',
  ];

  const tools: WebMcpToolDescriptor[] = [
    {
      name: 'journal_list_accounts',
      description: '获取当前可用的交易账户列表及当前选中的账户别名',
      defaultArgs: {},
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const resp = await accountService.getAccounts(context.userId);
          const accounts = (resp.data && resp.data.length > 0) ? resp.data : context.getAccounts() || [];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  current_selected_account: context.selectedAccountId,
                  count: accounts.length,
                  accounts,
                }),
              },
            ],
          };
        } catch (err) {
          const localAccounts = context.getAccounts() || [];
          if (localAccounts.length > 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    warning: '网络请求失败，返回本地缓存账户列表',
                    current_selected_account: context.selectedAccountId,
                    count: localAccounts.length,
                    accounts: localAccounts,
                  }),
                },
              ],
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'FETCH_FAILED',
                  message: err instanceof Error ? err.message : '获取账户列表失败',
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
      defaultArgs: { account_alias: 'main' },
      inputSchema: {
        type: 'object',
        properties: {
          account_alias: {
            type: 'string',
            description: '账户别名或账户ID，例如 "mock-account" 或 "main"',
          },
        },
        required: ['account_alias'],
      },
      execute: async (args: Record<string, unknown>) => {
        const alias = typeof args.account_alias === 'string' ? args.account_alias.trim() : '';
        if (!alias) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: 'account_alias is required',
                }),
              },
            ],
          };
        }

        const accounts = context.getAccounts() || [];
        if (accounts.length > 0 && !validateAccountExistence(alias, accounts)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'ACCOUNT_NOT_FOUND',
                  message: `未找到账户: '${alias}'。当前可用账户: ${accounts.map((a) => a.alias || a.id).join(', ')}`,
                }),
              },
            ],
          };
        }

        context.onSelectAccount(alias);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `已切换当前选中账户为: ${alias}`,
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
      defaultArgs: {},
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
        const targetAccount =
          typeof args.account_alias === 'string' && args.account_alias.trim()
            ? args.account_alias.trim()
            : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'NO_ACCOUNT_SELECTED',
                  message: '未选中任何账户，请指定 account_alias',
                }),
              },
            ],
          };
        }

        const accounts = context.getAccounts() || [];
        if (accounts.length > 0 && !validateAccountExistence(targetAccount, accounts)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'ACCOUNT_NOT_FOUND',
                  message: `账户 '${targetAccount}' 不存在。当前可用账户: ${accounts.map((a) => a.alias || a.id).join(', ')}`,
                }),
              },
            ],
          };
        }

        try {
          const resp = await portfolioService.getHoldings(targetAccount);
          const holdings = resp.data || [];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  account_alias: targetAccount,
                  is_snapshot: resp.isSnapshot || false,
                  count: holdings.length,
                  holdings,
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
                  success: false,
                  error: 'FETCH_FAILED',
                  message: err instanceof Error ? err.message : '获取账户持仓失败',
                  account_alias: targetAccount,
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'journal_get_trade_history',
      description: '获取账户的历史交易记录（支持时间范围和标的代码筛选，需要登录权限）',
      defaultArgs: { start_date: '2026-08-01', end_date: '2026-09-06' },
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
        if (context.isAuthenticated === false) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'AUTH_REQUIRED',
                  message: '未登录状态下禁止查询交易历史记录（trade history）。请登录后重试。',
                }),
              },
            ],
          };
        }

        const targetAccount =
          typeof args.account_alias === 'string' && args.account_alias.trim()
            ? args.account_alias.trim()
            : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'NO_ACCOUNT_SELECTED',
                  message: '未选中任何账户，请指定 account_alias',
                }),
              },
            ],
          };
        }

        const accounts = context.getAccounts() || [];
        if (accounts.length > 0 && !validateAccountExistence(targetAccount, accounts)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'ACCOUNT_NOT_FOUND',
                  message: `账户 '${targetAccount}' 不存在。当前可用账户: ${accounts.map((a) => a.alias || a.id).join(', ')}`,
                }),
              },
            ],
          };
        }

        const now = new Date();
        const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const defaultEnd = now.toISOString().split('T')[0];
        const start = typeof args.start_date === 'string' && args.start_date.trim() ? args.start_date.trim() : defaultStart;
        const end = typeof args.end_date === 'string' && args.end_date.trim() ? args.end_date.trim() : defaultEnd;

        if (!isValidDateString(start)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: `start_date 格式无效: "${args.start_date}"，必须为合法的 YYYY-MM-DD 格式（例如 "2026-08-01"）`,
                }),
              },
            ],
          };
        }

        if (!isValidDateString(end)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: `end_date 格式无效: "${args.end_date}"，必须为合法的 YYYY-MM-DD 格式（例如 "2026-09-06"）`,
                }),
              },
            ],
          };
        }

        if (start > end) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: `起始日期 start_date (${start}) 不能晚于结束日期 end_date (${end})`,
                }),
              },
            ],
          };
        }

        const stockCode = typeof args.stock_code === 'string' && args.stock_code.trim() ? args.stock_code.trim() : undefined;

        try {
          const resp = await portfolioService.getRecentTrades(
            context.userId,
            start,
            end,
            targetAccount,
            stockCode
          );
          const trades = resp.data || [];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  account_alias: targetAccount,
                  start_date: start,
                  end_date: end,
                  stock_code: stockCode || null,
                  total_trades: trades.length,
                  trades,
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
                  success: false,
                  error: 'FETCH_FAILED',
                  message: err instanceof Error ? err.message : '获取交易历史记录失败',
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'journal_get_today_orders',
      description: '获取账户当日的所有委托及成交订单（需要登录权限）',
      defaultArgs: {},
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
        if (context.isAuthenticated === false) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'AUTH_REQUIRED',
                  message: '未登录状态下禁止查询当日委托订单（today orders）。请登录后重试。',
                }),
              },
            ],
          };
        }

        const targetAccount =
          typeof args.account_alias === 'string' && args.account_alias.trim()
            ? args.account_alias.trim()
            : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'NO_ACCOUNT_SELECTED',
                  message: '未选中任何账户，请指定 account_alias',
                }),
              },
            ],
          };
        }

        const accounts = context.getAccounts() || [];
        if (accounts.length > 0 && !validateAccountExistence(targetAccount, accounts)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'ACCOUNT_NOT_FOUND',
                  message: `账户 '${targetAccount}' 不存在。当前可用账户: ${accounts.map((a) => a.alias || a.id).join(', ')}`,
                }),
              },
            ],
          };
        }

        try {
          const resp = await stockService.getTodayOrders(targetAccount);
          const orders = resp.data || [];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  account_alias: targetAccount,
                  total_orders: orders.length,
                  orders,
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
                  success: false,
                  error: 'FETCH_FAILED',
                  message: err instanceof Error ? err.message : '获取当日订单失败',
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'journal_get_orders_by_date',
      description: '按指定日期查询账户的历史成交及委托订单明细（需要登录权限）',
      defaultArgs: { date: new Date().toISOString().split('T')[0] },
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
        if (context.isAuthenticated === false) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'AUTH_REQUIRED',
                  message: '未登录状态下禁止查询指定日期的历史订单。请登录后重试。',
                }),
              },
            ],
          };
        }

        const date = typeof args.date === 'string' ? args.date.trim() : '';
        if (!date) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: 'date 参数为必填项',
                }),
              },
            ],
          };
        }

        if (!isValidDateString(date)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: `date 参数格式无效: "${date}"，必须为合法的 YYYY-MM-DD 格式（例如 "2026-09-05"）`,
                }),
              },
            ],
          };
        }

        const targetAccount =
          typeof args.account_alias === 'string' && args.account_alias.trim()
            ? args.account_alias.trim()
            : context.selectedAccountId;

        if (!targetAccount) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'NO_ACCOUNT_SELECTED',
                  message: '未选中任何账户，请指定 account_alias',
                }),
              },
            ],
          };
        }

        const accounts = context.getAccounts() || [];
        if (accounts.length > 0 && !validateAccountExistence(targetAccount, accounts)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'ACCOUNT_NOT_FOUND',
                  message: `账户 '${targetAccount}' 不存在。当前可用账户: ${accounts.map((a) => a.alias || a.id).join(', ')}`,
                }),
              },
            ],
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
                  success: true,
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
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'FETCH_FAILED',
                  message: err instanceof Error ? err.message : '获取订单失败',
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'journal_switch_tab',
      description: '切换 Journal 页面标签页（portfolio: 投资组合持仓, trades: 交易计划, history: 历史交易记录, orders: 成交订单/订单日历）',
      defaultArgs: { tab: 'portfolio' },
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
        const allTabs: JournalTab[] = ['portfolio', 'trades', 'history', 'orders'];
        if (!allTabs.includes(tab)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: `无效的标签页名称: "${tab}"，可选值: ${allTabs.join(', ')}`,
                }),
              },
            ],
          };
        }

        const allowedTabs = context.allowedTabs || (context.isAuthenticated === false ? ['portfolio'] : allTabs);
        if (!allowedTabs.includes(tab)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'AUTH_REQUIRED',
                  message: `未登录状态下禁止切换至 '${tab}' 标签页。当前可用标签页为: ${allowedTabs.join(', ')}。请先登录。`,
                  requested_tab: tab,
                  allowed_tabs: allowedTabs,
                }),
              },
            ],
          };
        }

        context.onSwitchTab(tab);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `已切换 Journal 标签页至 ${tab}`,
                activeTab: tab,
              }),
            },
          ],
        };
      },
    },
  ];

  const typedModelContext = modelContext as {
    registerTool?: (
      tool: WebMcpToolDescriptor,
      options?: { signal?: AbortSignal }
    ) => Promise<void>;
  } | null;

  const registrationPromise = (async () => {
    const registerFn = typedModelContext?.registerTool;
    if (typeof registerFn === 'function') {
      let registeredCount = 0;
      await Promise.allSettled(
        tools.map(async (tool) => {
          try {
            await registerFn.call(typedModelContext, tool, { signal });
            registeredCount++;
          } catch (err: unknown) {
            if ((err as Error)?.name !== 'AbortError' && !(err as Error)?.message?.includes('aborted')) {
              console.warn(`[WebMCP] Failed to register tool ${tool.name}:`, err);
            }
          }
        })
      );
      return registeredCount;
    }
    return tools.length;
  })();

  return {
    unregister: () => {
      // In WebMCP standard, passing an AbortSignal to registerTool auto-unregisters when aborted.
    },
    toolNames,
    tools,
    registrationPromise,
  };
}
