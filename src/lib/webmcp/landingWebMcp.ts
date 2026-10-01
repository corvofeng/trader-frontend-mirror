import '@mcp-b/global';
import { accountService, portfolioService } from '../services';
import type { Theme } from '../theme';
import type { Language } from '../../pages/Landing/i18n';

export interface LandingWebMcpContext {
  userId?: string | null;
  isAuthenticated?: boolean;
  currentTheme: Theme;
  currentLang: Language;
  onNavigate: (path: string) => void;
  onThemeChange: (theme: Theme) => void;
  onLanguageChange: (lang: Language) => void;
}

export interface WebMcpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  defaultArgs?: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

export interface LandingWebMcpRegistrationResult {
  unregister: () => void;
  toolNames: string[];
  tools: WebMcpToolDescriptor[];
  registrationPromise: Promise<number>;
}

export function registerLandingWebMcpTools(
  context: LandingWebMcpContext,
  signal?: AbortSignal
): LandingWebMcpRegistrationResult {
  const modelContext = (typeof document !== 'undefined' && (document as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof window !== 'undefined' && (window as unknown as { modelContext?: unknown }).modelContext) ||
    (typeof navigator !== 'undefined' && (navigator as unknown as { modelContext?: unknown }).modelContext);

  const toolNames = [
    'landing_get_overview',
    'landing_navigate',
    'landing_list_accounts',
    'landing_get_portfolio_preview',
    'landing_switch_language',
    'landing_switch_theme',
  ];

  const tools: WebMcpToolDescriptor[] = [
    {
      name: 'landing_get_overview',
      description: '获取交易系统主页概览、可访问的工作区模块与路由列表',
      defaultArgs: {},
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const isAuthed = Boolean(context.isAuthenticated ?? context.userId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                app_name: 'Stock Trading Platform',
                current_language: context.currentLang,
                current_theme: context.currentTheme,
                user_logged_in: isAuthed,
                modules: [
                  {
                    name: 'Journal (交易日志)',
                    path: '/journal',
                    description: isAuthed
                      ? '投资组合持仓、交易计划、历史交易记录与成交订单查看'
                      : '投资组合持仓（未登录状态下开放公开持仓；交易计划/历史/订单需登录）',
                    tabs: isAuthed
                      ? ['portfolio', 'trades', 'history', 'orders']
                      : ['portfolio'],
                  },
                  {
                    name: 'Options (期权交易工作台)',
                    path: '/options',
                    description: '期权持仓、到期风险、组合策略与市场状态',
                  },
                  {
                    name: 'Admin (管理中心)',
                    path: '/admin',
                    description: isAuthed
                      ? '自动化运维、数据新鲜度、任务流与现金流监控'
                      : '自动化运维与监控（需要登录权限）',
                    auth_required: true,
                  },
                  {
                    name: 'About (关于系统)',
                    path: '/about',
                    description: '系统架构、免责声明与版本信息',
                  },
                ],
              }),
            },
          ],
        };
      },
    },
    {
      name: 'landing_navigate',
      description: '跳转到系统指定页面（例如 /journal, /journal?tab=history, /journal?tab=orders, /options, /admin）',
      defaultArgs: { path: '/journal' },
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目标页面路径，如 "/journal", "/journal?tab=orders", "/options", "/admin"',
          },
        },
        required: ['path'],
      },
      execute: async (args: Record<string, unknown>) => {
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        if (!path) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'INVALID_PARAM', message: 'path is required' }) }],
          };
        }

        const isAuthed = Boolean(context.isAuthenticated ?? context.userId);

        if (path.startsWith('/admin') && !isAuthed) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'AUTH_REQUIRED',
                message: '访问管理中心（/admin）需要登录权限。当前未登录，无法跳转。',
                targetPath: path,
              }),
            }],
          };
        }

        if (path.startsWith('/journal') && !isAuthed) {
          try {
            const queryIndex = path.indexOf('?');
            if (queryIndex !== -1) {
              const query = path.slice(queryIndex);
              const params = new URLSearchParams(query);
              const tab = params.get('tab');
              if (tab && tab !== 'portfolio') {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      success: false,
                      error: 'AUTH_REQUIRED',
                      message: `未登录状态下 Journal 页面仅开放公开持仓（portfolio）。访问 '${tab}' 标签页需要登录权限。`,
                      requestedTab: tab,
                      allowedTabs: ['portfolio'],
                      targetPath: path,
                    }),
                  }],
                };
              }
            }
          } catch {
            // ignore
          }
        }

        context.onNavigate(path);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Navigated to ${path}`,
                targetPath: path,
              }),
            },
          ],
        };
      },
    },
    {
      name: 'landing_list_accounts',
      description: '获取交易账户列表与默认主账户',
      defaultArgs: {},
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const resp = await accountService.getAccounts(context.userId || 'mock-user-id');
          const accounts = resp.data || [];
          const defaultAccount = accounts.find((a) => a.is_default) || accounts[0] || null;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  total_accounts: accounts.length,
                  default_account: defaultAccount,
                  accounts,
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'FETCH_FAILED',
                message: err instanceof Error ? err.message : 'Failed to list accounts',
              }),
            }],
          };
        }
      },
    },
    {
      name: 'landing_get_portfolio_preview',
      description: '获取主账户的持仓及资产预览数据',
      defaultArgs: {},
      inputSchema: {
        type: 'object',
        properties: {
          account_alias: {
            type: 'string',
            description: '可选，指定账户别名。不传则使用默认主账户',
          },
        },
      },
      execute: async (args: Record<string, unknown>) => {
        try {
          const accResp = await accountService.getAccounts(context.userId || 'mock-user-id');
          const accounts = accResp.data || [];
          const availableAliases = accounts.map((a) => a.alias || a.id);

          let alias = typeof args.account_alias === 'string' ? args.account_alias.trim() : '';
          if (alias) {
            const exists = accounts.some((a) => (a.alias || a.id) === alias);
            if (!exists && accounts.length > 0) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'ACCOUNT_NOT_FOUND',
                    message: `账户别名 '${alias}' 不存在`,
                    available_accounts: availableAliases,
                  }),
                }],
              };
            }
          } else {
            const def = accounts.find((a) => a.is_default) || accounts[0];
            alias = (def?.alias || def?.id) || '';
          }

          if (!alias) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'NO_ACCOUNT_AVAILABLE',
                  message: '当前无可用交易账户',
                }),
              }],
            };
          }

          const resp = await portfolioService.getHoldings(alias);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  account_alias: alias,
                  is_snapshot: resp.isSnapshot || false,
                  holdings_count: resp.data?.length || 0,
                  holdings: resp.data || [],
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'FETCH_FAILED',
                message: err instanceof Error ? err.message : 'Failed to get portfolio preview',
              }),
            }],
          };
        }
      },
    },
    {
      name: 'landing_switch_language',
      description: '切换页面展示语言（zh: 中文, en: 英文）',
      inputSchema: {
        type: 'object',
        properties: {
          lang: {
            type: 'string',
            enum: ['zh', 'en'],
            description: '语言代码: zh 或 en',
          },
        },
        required: ['lang'],
      },
      execute: async (args: Record<string, unknown>) => {
        const lang = args.lang as Language;
        if (lang !== 'zh' && lang !== 'en') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'lang must be "zh" or "en"' }) }],
          };
        }
        context.onLanguageChange(lang);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Switched language to ${lang}`,
                currentLang: lang,
              }),
            },
          ],
        };
      },
    },
    {
      name: 'landing_switch_theme',
      description: '切换界面主题（light: 亮色, dark: 暗色, blue: 蓝色）',
      inputSchema: {
        type: 'object',
        properties: {
          theme: {
            type: 'string',
            enum: ['light', 'dark', 'blue'],
            description: '主题名称: light, dark 或 blue',
          },
        },
        required: ['theme'],
      },
      execute: async (args: Record<string, unknown>) => {
        const theme = args.theme as Theme;
        if (!['light', 'dark', 'blue'].includes(theme)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'theme must be "light", "dark", or "blue"' }) }],
          };
        }
        context.onThemeChange(theme);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Switched theme to ${theme}`,
                currentTheme: theme,
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
              console.warn(`[WebMCP] Failed to register landing tool ${tool.name}:`, err);
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
