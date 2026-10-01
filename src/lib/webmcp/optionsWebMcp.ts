import '@mcp-b/global';
import { optionsService } from '../services';
import type { OptionsTab } from '../../shared/utils/tabRouting';
import { OPTIONS_TABS } from '../../shared/utils/tabRouting';
import type { WebMcpToolDescriptor } from './landingWebMcp';

export interface OptionsWebMcpContext {
  userId?: string | null;
  selectedAccountId: string | null;
  selectedSymbol: string;
  activeTab: OptionsTab;
  isAuthenticated?: boolean;
  onSelectSymbol?: (symbol: string) => void;
  onSwitchTab?: (tab: OptionsTab) => void;
  onSelectAccount?: (accountId: string) => void;
}

export interface OptionsWebMcpRegistrationResult {
  unregister: () => void;
  toolNames: string[];
  tools: WebMcpToolDescriptor[];
  registrationPromise: Promise<number>;
}

const DEFAULT_SYMBOLS = ['588000.SH', '510050.SH', '510300.SH', '510500.SH', '159915.SZ'];

/**
 * Register WebMCP tools for Options analysis page.
 */
export function registerOptionsWebMcpTools(
  context: OptionsWebMcpContext,
  signal?: AbortSignal
): OptionsWebMcpRegistrationResult {
  const modelContext =
    (typeof document !== 'undefined' && (document as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof window !== 'undefined' && (window as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof navigator !== 'undefined' && (navigator as unknown as { modelContext?: unknown }).modelContext);

  const toolNames = [
    'options_get_overview',
    'options_list_symbols',
    'options_get_portfolio',
    'options_get_market_state',
    'options_switch_tab',
    'options_select_symbol',
  ];

  const tools: WebMcpToolDescriptor[] = [
    {
      name: 'options_get_overview',
      description: '获取期权交易分析模块当前上下文（当前标的、当前账户、活动标签页及支持的标的与功能）',
      defaultArgs: {},
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                selected_account: context.selectedAccountId,
                selected_symbol: context.selectedSymbol,
                active_tab: context.activeTab,
                is_authenticated: Boolean(context.isAuthenticated),
                available_tabs: OPTIONS_TABS,
                recommended_symbols: DEFAULT_SYMBOLS,
              }),
            },
          ],
        };
      },
    },
    {
      name: 'options_list_symbols',
      description: '获取支持期权分析与行情查询的标的代码列表',
      defaultArgs: {},
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const resp = await optionsService.getAvailableSymbols();
          const symbols = resp.data && resp.data.length > 0 ? resp.data : DEFAULT_SYMBOLS;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  count: symbols.length,
                  symbols,
                }),
              },
            ],
          };
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  warning: '获取标的列表网络请求失败，使用本地推荐标的',
                  count: DEFAULT_SYMBOLS.length,
                  symbols: DEFAULT_SYMBOLS,
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'options_get_portfolio',
      description: '获取指定账户或当前账户的期权持仓、标的现货持仓、到期分布及资金占用数据',
      defaultArgs: {},
      inputSchema: {
        type: 'object',
        properties: {
          account_alias: {
            type: 'string',
            description: '可选，账户别名或ID，默认使用当前选中账户',
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
                  message: '未选择任何账户，请指定 account_alias',
                }),
              },
            ],
          };
        }

        try {
          const resp = await optionsService.getOptionsPortfolio(context.userId || 'anonymous', targetAccount);
          const data = resp.data;
          if (!data) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'FETCH_FAILED',
                    message: resp.error || '获取期权持仓数据为空',
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
                  success: true,
                  account_alias: targetAccount,
                  balance: data.balance ?? 0,
                  available: data.available ?? 0,
                  total_value: data.totalValue ?? 0,
                  single_positions_count: data.singleLegPositions?.length ?? 0,
                  strategies_count: data.strategies?.length ?? 0,
                  subject_positions_count: data.subject_positions?.length ?? 0,
                  is_snapshot: data.is_snapshot ?? false,
                  expiry_buckets_count: data.expiryBuckets?.length ?? 0,
                  single_leg_positions: data.singleLegPositions || [],
                  strategies: data.strategies || [],
                  subject_positions: data.subject_positions || [],
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
                  message: err instanceof Error ? err.message : '获取期权持仓失败',
                  account_alias: targetAccount,
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'options_get_market_state',
      description: '获取指定标的的期权市场状态（持仓量PCR、成交量、波动率微笑形态等量化指标）',
      defaultArgs: { symbol: '588000.SH' },
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: '标的代码，如 "588000.SH", "510050.SH"',
          },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        const symbol =
          typeof args.symbol === 'string' && args.symbol.trim()
            ? args.symbol.trim()
            : context.selectedSymbol || '588000.SH';

        try {
          const resp = await optionsService.getOptionMarketState(symbol);
          if (!resp.data) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'FETCH_FAILED',
                    message: resp.error || `未能获取标的 ${symbol} 的期权市场状态`,
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
                  success: true,
                  symbol,
                  market_state: resp.data,
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
                  message: err instanceof Error ? err.message : `获取标的 ${symbol} 市场状态失败`,
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'options_switch_tab',
      description: '切换期权页面工作区标签页（data: 行情T型报价, portfolio: 持仓与希腊字母, analysis: 波动率与曲面, trading: 组合交易计划, management: 组合管理, whitelist: 白名单, expiry-risk: 到期风险, risk: 压力测试, market-state: 市场全景状态）',
      defaultArgs: { tab: 'data' },
      inputSchema: {
        type: 'object',
        properties: {
          tab: {
            type: 'string',
            enum: [...OPTIONS_TABS],
            description: '目标标签页',
          },
        },
        required: ['tab'],
      },
      execute: async (args: Record<string, unknown>) => {
        const tab = args.tab as OptionsTab;
        if (!OPTIONS_TABS.includes(tab)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: `无效的标签页: "${tab}"，可选值: ${OPTIONS_TABS.join(', ')}`,
                }),
              },
            ],
          };
        }

        context.onSwitchTab?.(tab);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `已切换 Options 页面标签页至 ${tab}`,
                activeTab: tab,
              }),
            },
          ],
        };
      },
    },
    {
      name: 'options_select_symbol',
      description: '切换当前分析的期权标的代码（例如 "588000.SH", "510050.SH", "510300.SH"）',
      defaultArgs: { symbol: '588000.SH' },
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: '标的代码',
          },
        },
        required: ['symbol'],
      },
      execute: async (args: Record<string, unknown>) => {
        const symbol = typeof args.symbol === 'string' ? args.symbol.trim() : '';
        if (!symbol) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: 'symbol 参数为必填项',
                }),
              },
            ],
          };
        }

        context.onSelectSymbol?.(symbol);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `已切换分析标的为: ${symbol}`,
                selectedSymbol: symbol,
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
              console.warn(`[WebMCP] Failed to register options tool ${tool.name}:`, err);
            }
          }
        })
      );
      return registeredCount;
    }
    return tools.length;
  })();

  return {
    unregister: () => {},
    toolNames,
    tools,
    registrationPromise,
  };
}
