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
  title?: string;
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

const ALLOWED_NAVIGATE_ROUTES = ['/', '/journal', '/about'];

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
      title: '获取主页概览与可用模块',
      description: '获取交易系统主页概览、数据更新口径与当前可访问的功能模块',
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
                data_mode: '每日收盘快照（QMT 盘后自动更新，不含盘中实时推送）',
                modules: [
                  {
                    name: 'Journal (投资组合与成交记录)',
                    path: '/journal',
                    description: isAuthed
                      ? '最新交易日收盘持仓、历史资产净值走势与成交流水明细'
                      : '投资组合持仓（未登录状态下开放公开持仓；交易计划/历史/订单需登录）',
                    tabs: isAuthed ? ['portfolio', 'trades', 'history', 'orders'] : ['portfolio'],
                  },
                  {
                    name: 'Options (期权分析)',
                    path: '/options',
                    description: '期权持仓、到期风险与市场状态',
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
                    name: 'About (关于系统与数据机制)',
                    path: '/about',
                    description: '系统架构说明、免责声明、联系方式与盘后数据同步机制',
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
      title: '页面导航跳转',
      description: '跳转到系统允许的路由页面（白名单：/ 为首页, /journal 为投资组合与记录, /about 为关于）',
      defaultArgs: { path: '/journal' },
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            enum: ['/', '/journal', '/about'],
            description: '目标页面白名单路径："/", "/journal", "/about"',
          },
        },
        required: ['path'],
      },
      execute: async (args: Record<string, unknown>) => {
        const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
        if (!rawPath) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'INVALID_PARAM', message: 'path is required' }) }],
          };
        }

        const pathWithoutQuery = rawPath.split('?')[0];
        if (!ALLOWED_NAVIGATE_ROUTES.includes(pathWithoutQuery)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'INVALID_ROUTE',
                message: `目标路径 '${rawPath}' 不在允许的白名单中。支持的路由为: ${ALLOWED_NAVIGATE_ROUTES.join(', ')}`,
                allowedRoutes: ALLOWED_NAVIGATE_ROUTES,
              }),
            }],
          };
        }

        context.onNavigate(rawPath);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `已成功跳转至 ${rawPath}`,
                targetPath: rawPath,
              }),
            },
          ],
        };
      },
    },
    {
      name: 'landing_list_accounts',
      title: '查询交易账户列表',
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
      title: '获取持仓与资产快照',
      description: '获取主账户的持仓及资产预览数据（包含 as_of 截至日期、币种、数据来源及指标口径）',
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
          let matchedAccount = accounts.find((a) => (a.alias || a.id) === alias);

          if (alias) {
            if (!matchedAccount && accounts.length > 0) {
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
            matchedAccount = accounts.find((a) => a.is_default) || accounts[0];
            alias = (matchedAccount?.alias || matchedAccount?.id) || '';
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
          const holdingsList = resp.data || [];
          const totalMarketValue = holdingsList.reduce((sum, h) => sum + (h.total_value ?? 0), 0);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  account_alias: alias,
                  account_name: matchedAccount?.account_name || '证券主账户',
                  currency: matchedAccount?.currency || 'CNY',
                  as_of: '最新交易日收盘（盘后结算）',
                  data_source: '每日收盘快照 (QMT 盘后自动更新)',
                  metric_definition: '现价与市值依据最新收盘日结算价计算，不含盘中实时变动',
                  is_snapshot: resp.isSnapshot ?? true,
                  total_market_value: totalMarketValue,
                  holdings_count: holdingsList.length,
                  holdings: holdingsList,
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
      title: '切换展示语言',
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
      title: '切换界面主题',
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
