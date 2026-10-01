import '@mcp-b/global';
import { cashFlowService, operationService } from '../services';
import type { AdminTab } from '../../shared/utils/tabRouting';
import { ADMIN_TABS } from '../../shared/utils/tabRouting';
import type { WebMcpToolDescriptor } from './landingWebMcp';

export interface AdminWebMcpContext {
  userId?: string | null;
  selectedAccountId: string | null;
  activeTab: AdminTab;
  isAuthenticated?: boolean;
  onSwitchTab?: (tab: AdminTab) => void;
  onSelectAccount?: (accountId: string) => void;
}

export interface AdminWebMcpRegistrationResult {
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

/**
 * Register WebMCP tools for Admin management page.
 */
export function registerAdminWebMcpTools(
  context: AdminWebMcpContext,
  signal?: AbortSignal
): AdminWebMcpRegistrationResult {
  const modelContext =
    (typeof document !== 'undefined' && (document as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof window !== 'undefined' && (window as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof navigator !== 'undefined' && (navigator as unknown as { modelContext?: unknown }).modelContext);

  const toolNames = [
    'admin_get_system_status',
    'admin_get_cash_flow_summary',
    'admin_get_operations',
    'admin_switch_tab',
  ];

  const tools: WebMcpToolDescriptor[] = [
    {
      name: 'admin_get_system_status',
      description: '获取系统管理中心状态（当前活动标签页、当前选中的管理账户及可访问的管理功能列表）',
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
                is_authenticated: Boolean(context.isAuthenticated),
                current_selected_account: context.selectedAccountId,
                active_tab: context.activeTab,
                available_tabs: ADMIN_TABS,
                message: context.isAuthenticated
                  ? '已作为管理员登录'
                  : '当前处于未登录状态，管理接口仅提供受限只读状态',
              }),
            },
          ],
        };
      },
    },
    {
      name: 'admin_get_cash_flow_summary',
      description: '获取指定账户的现金流与分红概览数据（需要登录管理员权限）',
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
        if (!context.isAuthenticated) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'AUTH_REQUIRED',
                  message: '查询账户现金流汇总需要管理员登录权限。请登录后重试。',
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
                  message: '未选择任何账户，请指定 account_alias',
                }),
              },
            ],
          };
        }

        try {
          const resp = await cashFlowService.getCashFlows(targetAccount);
          const data = resp.data;
          if (!data) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'FETCH_FAILED',
                    message: resp.error || '获取现金流数据为空',
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
                  items_count: data.items?.length ?? 0,
                  recent_items: (data.items || []).slice(0, 10),
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
                  message: err instanceof Error ? err.message : '获取现金流数据失败',
                  account_alias: targetAccount,
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'admin_get_operations',
      description: '查询系统日常运维日志与资产快照操作流水（需要登录管理员权限）',
      defaultArgs: {
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      },
      inputSchema: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: '起始日期，格式 YYYY-MM-DD，默认 30 天前',
          },
          end_date: {
            type: 'string',
            description: '结束日期，格式 YYYY-MM-DD，默认今天',
          },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        if (!context.isAuthenticated) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'AUTH_REQUIRED',
                  message: '查询系统运维日志流水需要管理员登录权限。请登录后重试。',
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

        try {
          const resp = await operationService.getOperations(start, end);
          const ops = resp.data || [];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  start_date: start,
                  end_date: end,
                  total_operations: ops.length,
                  operations: ops.slice(0, 20),
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
                  message: err instanceof Error ? err.message : '获取运维日志失败',
                }),
              },
            ],
          };
        }
      },
    },
    {
      name: 'admin_switch_tab',
      description: '切换管理中心标签页（operations: 运维流水, calendar: 订单日历, analysis: 分析, history: 历史委托, tasks: 任务流, notices: 系统通知, accounts: 账户监控, upload: 上传, cash-flows: 现金流）（需要登录管理员权限）',
      defaultArgs: { tab: 'operations' },
      inputSchema: {
        type: 'object',
        properties: {
          tab: {
            type: 'string',
            enum: [...ADMIN_TABS],
            description: '目标标签页',
          },
        },
        required: ['tab'],
      },
      execute: async (args: Record<string, unknown>) => {
        if (!context.isAuthenticated) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'AUTH_REQUIRED',
                  message: '未登录状态下禁止切换管理中心标签页。请先登录。',
                }),
              },
            ],
          };
        }

        const tab = args.tab as AdminTab;
        if (!ADMIN_TABS.includes(tab)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'INVALID_PARAM',
                  message: `无效的标签页: "${tab}"，可选值: ${ADMIN_TABS.join(', ')}`,
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
                message: `已切换 Admin 标签页至 ${tab}`,
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
              console.warn(`[WebMCP] Failed to register admin tool ${tool.name}:`, err);
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
