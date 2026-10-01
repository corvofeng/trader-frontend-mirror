import { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Play,
  Terminal,
  Cpu,
  Sparkles,
  ExternalLink,
  BookOpen,
  Code2,
  Bot,
  MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { themes, type Theme } from '../../theme';

export interface WebMcpToolItem {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  defaultArgs?: Record<string, unknown>;
}

export interface WebMcpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  pageTitle?: string;
  customTools?: WebMcpToolItem[];
  isReady?: boolean;
  registeredCount?: number;
}

const DEFAULT_TOOL_ARGS: Record<string, Record<string, unknown>> = {
  journal_list_accounts: {},
  journal_select_account: { account_alias: 'main' },
  journal_get_portfolio: {},
  journal_get_trade_history: { start_date: '2026-08-01', end_date: '2026-09-06' },
  journal_get_today_orders: {},
  journal_get_orders_by_date: { date: new Date().toISOString().split('T')[0] },
  journal_switch_tab: { tab: 'history' },
  landing_get_overview: {},
  landing_navigate: { path: '/journal' },
  landing_list_accounts: {},
  landing_get_portfolio_preview: {},
  landing_switch_language: { lang: 'zh' },
  landing_switch_theme: { theme: 'dark' },
  options_get_overview: {},
  options_list_symbols: {},
  options_get_portfolio: {},
  options_get_market_state: { symbol: '588000.SH' },
  options_switch_tab: { tab: 'data' },
  options_select_symbol: { symbol: '588000.SH' },
  admin_get_system_status: {},
  admin_get_cash_flow_summary: {},
  admin_get_operations: { start_date: '2026-08-01', end_date: '2026-09-06' },
  admin_switch_tab: { tab: 'operations' },
};

const FALLBACK_LANDING_TOOLS: WebMcpToolItem[] = [
  {
    name: 'landing_get_overview',
    description: '获取交易系统主页概览、可访问的工作区模块与路由列表',
    inputSchema: { type: 'object', properties: {} },
    defaultArgs: {},
  },
  {
    name: 'landing_navigate',
    description: '跳转到系统指定页面（例如 /journal, /journal?tab=history, /journal?tab=orders, /options, /admin）',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: '目标页面路径' } }, required: ['path'] },
    defaultArgs: { path: '/journal' },
  },
  {
    name: 'landing_list_accounts',
    description: '获取交易账户列表与默认主账户',
    inputSchema: { type: 'object', properties: {} },
    defaultArgs: {},
  },
  {
    name: 'landing_get_portfolio_preview',
    description: '获取主账户的持仓及资产预览数据',
    inputSchema: { type: 'object', properties: { account_alias: { type: 'string', description: '可选，指定账户别名' } } },
    defaultArgs: {},
  },
  {
    name: 'landing_switch_language',
    description: '切换页面展示语言（zh: 中文, en: 英文）',
    inputSchema: { type: 'object', properties: { lang: { type: 'string', enum: ['zh', 'en'] } }, required: ['lang'] },
    defaultArgs: { lang: 'zh' },
  },
  {
    name: 'landing_switch_theme',
    description: '切换界面主题（light: 亮色, dark: 暗色, blue: 蓝色）',
    inputSchema: { type: 'object', properties: { theme: { type: 'string', enum: ['light', 'dark', 'blue'] } }, required: ['theme'] },
    defaultArgs: { theme: 'dark' },
  },
];

const FALLBACK_JOURNAL_TOOLS: WebMcpToolItem[] = [
  {
    name: 'journal_list_accounts',
    description: '列出当前用户的所有交易账户、资金别名及默认状态',
    inputSchema: { type: 'object', properties: {} },
    defaultArgs: {},
  },
  {
    name: 'journal_select_account',
    description: '切换当前查看的交易账户别名',
    inputSchema: { type: 'object', properties: { account_alias: { type: 'string' } }, required: ['account_alias'] },
    defaultArgs: { account_alias: 'main' },
  },
  {
    name: 'journal_get_portfolio',
    description: '获取当前选中账户的实时/快照持仓及资产列表',
    inputSchema: { type: 'object', properties: { account_alias: { type: 'string' } } },
    defaultArgs: {},
  },
  {
    name: 'journal_get_trade_history',
    description: '按日期范围与标的查询历史交易成交明细',
    inputSchema: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' } } },
    defaultArgs: { start_date: '2026-08-01', end_date: '2026-09-06' },
  },
  {
    name: 'journal_get_today_orders',
    description: '获取账户当日的所有委托及成交订单',
    inputSchema: { type: 'object', properties: { account_alias: { type: 'string' } } },
    defaultArgs: {},
  },
  {
    name: 'journal_get_orders_by_date',
    description: '按指定日期查询账户的历史成交及委托订单明细',
    inputSchema: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'] },
    defaultArgs: { date: new Date().toISOString().split('T')[0] },
  },
  {
    name: 'journal_switch_tab',
    description: '切换 Journal 页面工作区标签',
    inputSchema: { type: 'object', properties: { tab: { type: 'string', enum: ['portfolio', 'trades', 'history', 'orders'] } }, required: ['tab'] },
    defaultArgs: { tab: 'history' },
  },
];

const FALLBACK_OPTIONS_TOOLS: WebMcpToolItem[] = [
  {
    name: 'options_get_overview',
    description: '获取期权交易分析模块当前上下文（当前标的、当前账户、活动标签页及功能列表）',
    inputSchema: { type: 'object', properties: {} },
    defaultArgs: {},
  },
  {
    name: 'options_list_symbols',
    description: '获取支持期权分析与行情查询的标的代码列表',
    inputSchema: { type: 'object', properties: {} },
    defaultArgs: {},
  },
  {
    name: 'options_get_portfolio',
    description: '获取指定账户或当前账户的期权持仓、现货持仓、到期分布及资金占用数据',
    inputSchema: { type: 'object', properties: { account_alias: { type: 'string' } } },
    defaultArgs: {},
  },
  {
    name: 'options_get_market_state',
    description: '获取指定标的的期权市场状态（持仓量PCR、成交量、波动率形态等量化指标）',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string' } } },
    defaultArgs: { symbol: '588000.SH' },
  },
  {
    name: 'options_switch_tab',
    description: '切换期权页面工作区标签页',
    inputSchema: { type: 'object', properties: { tab: { type: 'string' } }, required: ['tab'] },
    defaultArgs: { tab: 'data' },
  },
  {
    name: 'options_select_symbol',
    description: '切换当前分析的期权标的代码（例如 "588000.SH", "510050.SH"）',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    defaultArgs: { symbol: '588000.SH' },
  },
];

const FALLBACK_ADMIN_TOOLS: WebMcpToolItem[] = [
  {
    name: 'admin_get_system_status',
    description: '获取系统管理中心状态（当前活动标签页、当前选中的管理账户及可访问的管理功能列表）',
    inputSchema: { type: 'object', properties: {} },
    defaultArgs: {},
  },
  {
    name: 'admin_get_cash_flow_summary',
    description: '获取指定账户的现金流与分红概览数据（需要登录管理员权限）',
    inputSchema: { type: 'object', properties: { account_alias: { type: 'string' } } },
    defaultArgs: {},
  },
  {
    name: 'admin_get_operations',
    description: '查询系统日常运维日志与资产快照操作流水（需要登录管理员权限）',
    inputSchema: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' } } },
    defaultArgs: { start_date: '2026-08-01', end_date: '2026-09-06' },
  },
  {
    name: 'admin_switch_tab',
    description: '切换管理中心标签页（需要登录管理员权限）',
    inputSchema: { type: 'object', properties: { tab: { type: 'string' } }, required: ['tab'] },
    defaultArgs: { tab: 'operations' },
  },
];

export function WebMcpGuideModal({
  isOpen,
  onClose,
  theme,
  pageTitle = '当前页面',
  customTools,
  isReady,
  registeredCount,
}: WebMcpGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'prompts' | 'tools' | 'guide'>('prompts');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toolArgsState, setToolArgsState] = useState<Record<string, string>>({});
  const [toolResults, setToolResults] = useState<Record<string, { status: 'success' | 'error'; data: unknown }>>({});
  const [executingTool, setExecutingTool] = useState<string | null>(null);

  const currentUrl = useMemo(() => {
    return typeof window !== 'undefined' ? window.location.href : 'https://stock.in.corvo.fun';
  }, []);

  const currentHost = useMemo(() => {
    return typeof window !== 'undefined' ? window.location.host : 'stock.in.corvo.fun';
  }, []);

  // Discover registered tools from customTools, document.modelContext, window.modelContext, or navigator
  const availableTools: WebMcpToolItem[] = useMemo(() => {
    if (customTools && customTools.length > 0) {
      return customTools.map((t) => ({
        ...t,
        defaultArgs: t.defaultArgs || DEFAULT_TOOL_ARGS[t.name] || {},
      }));
    }

    if (typeof window !== 'undefined') {
      const mc =
        (typeof document !== 'undefined' ? (document as unknown as { modelContext?: { listTools?: () => WebMcpToolItem[] } }).modelContext : null) ||
        (window as unknown as { modelContext?: { listTools?: () => WebMcpToolItem[] } }).modelContext;

      if (typeof mc?.listTools === 'function') {
        try {
          const list = mc.listTools();
          if (Array.isArray(list) && list.length > 0) {
            return list.map((t) => ({
              ...t,
              defaultArgs: DEFAULT_TOOL_ARGS[t.name] || {},
            }));
          }
        } catch {
          // ignore
        }
      }

      const testing = (window.navigator as unknown as {
        modelContextTesting?: {
          listTools?: () => WebMcpToolItem[];
        };
      }).modelContextTesting;

      if (typeof testing?.listTools === 'function') {
        try {
          const list = testing.listTools();
          if (Array.isArray(list) && list.length > 0) {
            return list.map((t) => ({
              ...t,
              defaultArgs: DEFAULT_TOOL_ARGS[t.name] || {},
            }));
          }
        } catch {
          // ignore error and fallback
        }
      }
    }

    // Default fallback based on route/page
    if (currentUrl.includes('/options') || pageTitle.includes('Options')) {
      return FALLBACK_OPTIONS_TOOLS;
    }
    if (currentUrl.includes('/admin') || pageTitle.includes('Admin')) {
      return FALLBACK_ADMIN_TOOLS;
    }
    if (currentUrl.includes('/journal') || pageTitle.includes('Journal')) {
      return FALLBACK_JOURNAL_TOOLS;
    }
    return FALLBACK_LANDING_TOOLS;
  }, [customTools, currentUrl, pageTitle]);

  const toolNamesList = useMemo(() => {
    return availableTools.map((t) => t.name).join(', ');
  }, [availableTools]);

  const aiPrompts = useMemo(() => {
    if (currentUrl.includes('/options') || pageTitle.includes('Options')) {
      return [
        {
          id: 'prompt-options-overview',
          title: '期权持仓与希腊字母全景诊断（推荐）',
          badge: '常用',
          desc: '让 AI 调取当前期权账户持仓、到期分布与保证金占用情况',
          content: `我正在访问期权交易分析页面：${currentUrl}
当前页面已注册 WebMCP 工具：${toolNamesList || 'options_get_overview, options_get_portfolio, options_get_market_state, options_list_symbols'}
请帮我：
1. 调用 options_get_overview 查看当前选中的账户与分析标的；
2. 调用 options_get_portfolio 获取账户当前的期权持仓、备兑现货持仓与保证金占用；
3. 调用 options_get_market_state 获取当前标的的期权持仓量与市场形态；
4. 综合汇报期权持仓的到期风险与资金安全边界。`,
        },
        {
          id: 'prompt-options-state',
          title: '标的期权市场状态分析',
          badge: '量化',
          desc: '查询持仓量PCR、成交量及量化特征',
          content: `我正在访问期权分析页面：${currentUrl}
请调用 options_get_market_state 查看标的 "588000.SH" 的市场指标，重点分析持仓量 PCR 与多空情绪。`,
        },
      ];
    }

    if (currentUrl.includes('/admin') || pageTitle.includes('Admin')) {
      return [
        {
          id: 'prompt-admin-status',
          title: '系统运维与管理员状态排查（推荐）',
          badge: '管理',
          desc: '让 AI 检查管理中心状态、现金流与运维流水',
          content: `我正在访问管理中心页面：${currentUrl}
当前页面已注册 WebMCP 工具：${toolNamesList || 'admin_get_system_status, admin_get_cash_flow_summary, admin_get_operations'}
请帮我：
1. 调用 admin_get_system_status 检查系统管理中心状态及当前选中的账户；
2. 如果具备管理员权限，调用 admin_get_cash_flow_summary 查询账户现金流汇总，并调用 admin_get_operations 查看最近运维流水；
3. 如果未登录，请明确提示需登录管理员账号。`,
        },
      ];
    }

    const isJournal = currentUrl.includes('/journal') || pageTitle.includes('Journal');

    if (isJournal) {
      return [
        {
          id: 'prompt-journal-all',
          title: '综合诊断与持仓分析（推荐）',
          badge: '常用',
          desc: '让 AI 自动读取当前页面的账户、最新持仓与今日订单，综合分析交易现状',
          content: `我正在访问交易平台页面：${currentUrl}
当前页面已支持 W3C WebMCP 标准，并在 document.modelContext 注册了以下工具：
${toolNamesList || 'journal_list_accounts, journal_get_portfolio, journal_get_today_orders, journal_get_trade_history'}

请按以下步骤调用 WebMCP 工具为我服务：
1. 调用 journal_list_accounts 查看我有哪些交易账户以及当前选中的账户；
2. 调用 journal_get_portfolio 获取当前账户的最新持仓与资产快照；
3. 调用 journal_get_today_orders 获取今日最新的委托与成交订单；
4. 综合以上数据，简要总结我的持仓风险、今日盈亏与操作建议。`,
        },
        {
          id: 'prompt-journal-orders',
          title: '今日成交订单核对与排查',
          badge: '订单',
          desc: '让 AI 调取今日委托明细，统计已成交价格、数量与撤单详情',
          content: `我正在访问交易页面：${currentUrl}
请调用当前页面的 WebMCP 工具 journal_get_today_orders 查询我今日的委托与成交订单列表。
请帮我统计并汇报：
1. 今日总委托笔数，其中已成交（FILLED/TRADED）与已撤销（CANCELED）各有多少笔；
2. 逐笔列出已成交订单的标的代码与名称、买卖方向、成交价格、成交数量；
3. 如有废单、拒单或撤单，请指出原因。`,
        },
        {
          id: 'prompt-journal-history',
          title: '历史成交记录复盘',
          badge: '复盘',
          desc: '让 AI 调取历史交易成交数据，复盘交易胜率与标的分布',
          content: `我正在访问交易页面：${currentUrl}
请调用 WebMCP 工具 journal_get_trade_history 获取该账户近期的历史成交明细（可传入 start_date 和 end_date）。
请帮我复盘近期的交易特征，分析主要交易标的集中度以及交易频率。`,
        },
        {
          id: 'prompt-journal-switch',
          title: '切换账户并查询持仓',
          badge: '账户',
          desc: '让 AI 自动发现所有账户并切换到指定账户查询',
          content: `我正在访问交易页面：${currentUrl}
请调用 journal_list_accounts 查看我的所有交易账户列表。
然后调用 journal_select_account 切换到目标账户，并调用 journal_get_portfolio 汇报该账户的最新持仓情况。`,
        },
      ];
    }

    // Landing / Home page prompts
    return [
      {
        id: 'prompt-landing-overview',
        title: '平台全貌与主账户预览（推荐）',
        badge: '常用',
        desc: '在主页直接获取交易系统可用模块与主账户持仓概览',
        content: `我正在访问交易系统主页：${currentUrl} (Host: ${currentHost})
当前页面已支持 WebMCP 标准（可用工具：${toolNamesList || 'landing_get_overview, landing_list_accounts, landing_get_portfolio_preview, landing_navigate'}）。
请帮我：
1. 调用 landing_get_overview 了解本交易系统包含哪些主要模块与功能；
2. 调用 landing_list_accounts 和 landing_get_portfolio_preview 预览我的主账户资产与持仓情况；
3. 如果我想查看今日成交订单，请告诉我该进入哪个模块。`,
      },
      {
        id: 'prompt-landing-navigate',
        title: 'AI 自动导航到交易日志',
        badge: '导航',
        desc: '让 AI 直接调用导航工具跳转至成交订单页面',
        content: `我正在访问交易系统主页：${currentUrl}
请调用 WebMCP 工具 landing_navigate 将页面跳转至成交订单页面（/journal?tab=orders），并在跳转后告诉我在该页面可以查看哪些信息。`,
      },
    ];
  }, [currentUrl, currentHost, pageTitle, toolNamesList]);

  if (!isOpen) return null;

  const copyToClipboard = async (text: string, key: string, label = '代码') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label}已复制到剪贴板！`, { duration: 2000 });
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  const getArgsForTool = (toolName: string, defaultArgs?: Record<string, unknown>) => {
    if (toolArgsState[toolName] !== undefined) {
      return toolArgsState[toolName];
    }
    const def = defaultArgs || DEFAULT_TOOL_ARGS[toolName] || {};
    return JSON.stringify(def, null, 2);
  };

  const handleExecuteTool = async (toolName: string, argsStr: string) => {
    setExecutingTool(toolName);
    try {
      let parsedArgs: Record<string, unknown> = {};
      if (argsStr.trim()) {
        parsedArgs = JSON.parse(argsStr);
      }

      let result: unknown = null;

      // 1. Direct execution via customTools (fastest and most reliable)
      const customTool = customTools?.find((t) => t.name === toolName);
      if (typeof (customTool as unknown as { execute?: (args: Record<string, unknown>) => Promise<unknown> })?.execute === 'function') {
        result = await (customTool as unknown as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute(parsedArgs);
      } else {
        // 2. Standard WebMCP execution via document.modelContext or window.modelContext
        const mc =
          (typeof document !== 'undefined' ? (document as unknown as { modelContext?: unknown }).modelContext : null) ||
          (typeof window !== 'undefined' ? (window as unknown as { modelContext?: unknown }).modelContext : null);

        const typedMc = mc as {
          getTools?: () => Promise<Array<{ name: string }>>;
          executeTool?: (tool: unknown, inputArgsJson: string) => Promise<unknown>;
        } | null;

        if (typedMc && typeof typedMc.getTools === 'function' && typeof typedMc.executeTool === 'function') {
          const registeredList = await typedMc.getTools();
          const targetDescriptor = registeredList?.find((t) => t.name === toolName);
          if (targetDescriptor) {
            let rawRes: unknown;
            try {
              rawRes = await (typedMc.executeTool as (tool: unknown, args: unknown) => Promise<unknown>)(targetDescriptor, parsedArgs);
            } catch {
              rawRes = await (typedMc.executeTool as (tool: unknown, args: unknown) => Promise<unknown>)(targetDescriptor, JSON.stringify(parsedArgs));
            }
            try {
              result = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
            } catch {
              result = rawRes;
            }
          }
        }

        // 3. Fallback to testing shim if available
        if (!result && typeof window !== 'undefined') {
          const testing = (window.navigator as unknown as {
            modelContextTesting?: {
              executeTool?: (name: string, argsJson: string) => Promise<unknown>;
            };
          }).modelContextTesting;

          if (typeof testing?.executeTool === 'function') {
            result = await testing.executeTool(toolName, JSON.stringify(parsedArgs));
          }
        }
      }

      if (result !== null && result !== undefined) {
        setToolResults((prev) => ({
          ...prev,
          [toolName]: { status: 'success', data: result },
        }));
        toast.success(`工具 ${toolName} 执行成功！`);
      } else {
        throw new Error(`未找到工具 ${toolName} 的执行入口，请确认工具已在当前页面挂载`);
      }
    } catch (err) {
      setToolResults((prev) => ({
        ...prev,
        [toolName]: {
          status: 'error',
          data: err instanceof Error ? err.message : String(err),
        },
      }));
      toast.error(`执行失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecutingTool(null);
    }
  };

  const sampleToolName = availableTools[0]?.name || 'landing_get_overview';

  const isReadyEffective = isReady !== undefined ? isReady : (registeredCount ?? availableTools.length) > 0;

  const consoleAllToolsSnippet = `// 1. 列出当前网页注册的所有 WebMCP 工具 (W3C WebMCP 标准)
const tools = await (document.modelContext || window.modelContext).getTools();
console.table(tools);`;

  const consoleSampleRunSnippet = `// 2. 调用指定工具（例如 ${sampleToolName}）
const tools = await (document.modelContext || window.modelContext).getTools();
const target = tools.find(t => t.name === '${sampleToolName}');
const res = await (document.modelContext || window.modelContext).executeTool(target, {});
console.log(typeof res === 'string' ? JSON.parse(res) : res);`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`${themes[theme].card} w-full max-w-3xl max-h-[88vh] rounded-2xl shadow-2xl border ${themes[theme].border} flex flex-col overflow-hidden transition-all duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4 border-b ${themes[theme].border} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-lg font-bold ${themes[theme].text}`}>
                  WebMCP 工具面板与 AI 提示词
                </h3>
                {isReadyEffective ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    已就绪
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-spin" />
                    就绪中...
                  </span>
                )}
              </div>
              <p className={`text-xs ${themes[theme].text} opacity-60 mt-0.5`}>
                当前 Host: <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">{currentHost}</span> · {pageTitle}{isReadyEffective ? `已挂载 ${registeredCount ?? availableTools.length} 项标准工具` : '正在挂载工具...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 ${themes[theme].text} opacity-60 hover:opacity-100 transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`px-6 pt-3 border-b ${themes[theme].border} flex gap-4 bg-gray-50/50 dark:bg-gray-900/30 overflow-x-auto`}>
          <button
            type="button"
            onClick={() => setActiveTab('prompts')}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'prompts'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            🤖 一键复制 AI 对话提示词
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'tools'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            可用工具与在线测试 ({availableTools.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'guide'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            控制台与接入说明
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: AI PROMPTS */}
          {activeTab === 'prompts' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">已自动拼接当前 Host 与 URL：</span>
                  你可以直接点击下方的“<strong>一键复制 Prompt</strong>”，粘贴到与 AI（如 Claude、Gemini、ChatGPT 或带 MCP 的浏览器助手）的对话框中。AI 将自动通过本页的 WebMCP 工具获取最新数据并为您解答！
                </div>
              </div>

              <div className="space-y-4">
                {aiPrompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    className={`p-4 rounded-xl border ${themes[theme].border} bg-white dark:bg-gray-900/60 hover:shadow-xs transition-all space-y-3`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${themes[theme].text}`}>
                              {prompt.title}
                            </span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                              {prompt.badge}
                            </span>
                          </div>
                          <p className={`text-xs ${themes[theme].text} opacity-70 mt-0.5`}>
                            {prompt.desc}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyToClipboard(prompt.content, prompt.id, prompt.title)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all shrink-0 cursor-pointer"
                      >
                        {copiedKey === prompt.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                            已复制到剪贴板
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            复制 Prompt
                          </>
                        )}
                      </button>
                    </div>

                    {/* Code snippet display */}
                    <div className="relative rounded-lg bg-gray-50 dark:bg-gray-950/70 p-3 border border-gray-200 dark:border-gray-800 text-[11px] font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed max-h-36 overflow-y-auto">
                      {prompt.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: TOOLS & SANDBOX */}
          {activeTab === 'tools' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">AI 浏览器代理已可直接调用：</span>
                  当前页面已在 <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 font-mono">document.modelContext</code> 注册以下工具。你可以点击右侧按钮直接复制代码在 DevTools Console 中调试，也可以在此处直接点击“立即测试”。
                </div>
              </div>

              {availableTools.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  当前环境未发现已注册的工具。
                </div>
              ) : (
                <div className="space-y-3">
                  {availableTools.map((tool) => {
                    const currentArgs = getArgsForTool(tool.name, tool.defaultArgs);
                    const formattedArgs = (currentArgs.trim() || '{}').replace(/\s+/g, ' ');
                    const executionSnippet = `// 网页控制台调用 ${tool.name} (W3C WebMCP 标准)
const tools = await (document.modelContext || window.modelContext).getTools();
const target = tools.find(t => t.name === '${tool.name}');
const res = await (document.modelContext || window.modelContext).executeTool(target, ${formattedArgs});
console.log(typeof res === 'string' ? JSON.parse(res) : res);`;
                    const result = toolResults[tool.name];

                    return (
                      <div
                        key={tool.name}
                        className={`p-4 rounded-xl border ${themes[theme].border} bg-white dark:bg-gray-900/60 hover:shadow-xs transition-all`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-gray-100 dark:border-gray-800">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                              {tool.name}
                            </span>
                            <span className={`text-xs ${themes[theme].text} opacity-80`}>
                              {tool.description}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(executionSnippet, `exec-${tool.name}`, '测试命令')}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium ${themes[theme].secondary} transition-colors`}
                              title="复制在控制台运行的 JavaScript 代码"
                            >
                              {copiedKey === `exec-${tool.name}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-60" />
                              )}
                              复制命令
                            </button>

                            <button
                              type="button"
                              onClick={() => handleExecuteTool(tool.name, currentArgs)}
                              disabled={executingTool === tool.name}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs"
                            >
                              <Play className={`w-3 h-3 ${executingTool === tool.name ? 'animate-spin' : ''}`} />
                              {executingTool === tool.name ? '执行中…' : '立即测试'}
                            </button>
                          </div>
                        </div>

                        {/* Parameter args input */}
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                              入参 JSON (arguments):
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(currentArgs, `args-${tool.name}`, '入参 JSON')}
                              className="text-[10px] text-indigo-500 hover:underline inline-flex items-center gap-0.5"
                            >
                              {copiedKey === `args-${tool.name}` ? '已复制' : '复制 JSON'}
                            </button>
                          </div>
                          <textarea
                            rows={Math.min(4, Math.max(1, currentArgs.split('\n').length))}
                            value={currentArgs}
                            onChange={(e) => {
                              const val = e.target.value;
                              setToolArgsState((prev) => ({ ...prev, [tool.name]: val }));
                            }}
                            className={`w-full font-mono text-[11px] p-2 rounded-lg border ${themes[theme].border} bg-gray-50 dark:bg-gray-950/50 ${themes[theme].text} focus:outline-none focus:ring-1 focus:ring-indigo-500`}
                          />
                        </div>

                        {/* Live execution result box */}
                        {result && (
                          <div className="mt-3 p-3 rounded-lg bg-gray-900 text-gray-100 font-mono text-[11px] overflow-x-auto">
                            <div className="flex items-center justify-between pb-1 mb-1 border-b border-gray-800">
                              <span className={result.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                                {result.status === 'success' ? '✓ 执行成功结果 (Result)' : '✕ 执行异常 (Error)'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(
                                    typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2),
                                    `res-${tool.name}`,
                                    '执行结果'
                                  )
                                }
                                className="text-[10px] text-gray-400 hover:text-white inline-flex items-center gap-1"
                              >
                                {copiedKey === `res-${tool.name}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                复制结果
                              </button>
                            </div>
                            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-[11px]">
                              {typeof result.data === 'string'
                                ? result.data
                                : JSON.stringify(result.data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GUIDE */}
          {activeTab === 'guide' && (
            <div className="space-y-6 text-xs leading-relaxed">
              {/* What is WebMCP */}
              <div className={`p-4 rounded-xl border ${themes[theme].border} bg-white dark:bg-gray-900/60 space-y-2`}>
                <div className="flex items-center gap-2 font-bold text-sm text-indigo-600 dark:text-indigo-400">
                  <Cpu className="w-4 h-4" />
                  什么是 WebMCP？
                </div>
                <p className={`${themes[theme].text} opacity-85`}>
                  <strong>WebMCP</strong>（W3C Web Model Context Protocol 标准）将 Anthropic 提出的 Model Context Protocol 原生引入浏览器。通过在网页中暴露 <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">document.modelContext.registerTool</code>，AI Agent（如浏览器中的 Claude、ChatGPT、Gemini 扩展，或者 Chrome DevTools MCP）可以直接感知网页支持的操作，并直接发起函数调用，无需依赖脆弱的 DOM 爬取或模拟点击。
                </p>
              </div>

              {/* Console Debugging Usage */}
              <div className={`p-4 rounded-xl border ${themes[theme].border} bg-white dark:bg-gray-900/60 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    <Terminal className="w-4 h-4" />
                    用法 1：在浏览器开发者控制台（Console）中调试
                  </div>
                </div>
                <p className={`${themes[theme].text} opacity-75`}>
                  按 <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 font-mono">F12</kbd> 打开 DevTools Console，可直接使用标准接口 <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">document.modelContext</code> 或 <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">window.modelContext</code>：
                </p>

                <div className="relative rounded-lg bg-gray-900 text-gray-100 p-3 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(consoleAllToolsSnippet, 'console-all', '查看所有工具代码')}
                    className="absolute top-2 right-2 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center gap-1 text-[10px] transition-colors"
                  >
                    {copiedKey === 'console-all' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    复制代码
                  </button>
                  <pre>{consoleAllToolsSnippet}</pre>
                </div>

                <div className="relative rounded-lg bg-gray-900 text-gray-100 p-3 font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(consoleSampleRunSnippet, 'console-sample', '调用工具示例代码')}
                    className="absolute top-2 right-2 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center gap-1 text-[10px] transition-colors"
                  >
                    {copiedKey === 'console-sample' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    复制代码
                  </button>
                  <pre>{consoleSampleRunSnippet}</pre>
                </div>
              </div>

              {/* AI Agent Connection */}
              <div className={`p-4 rounded-xl border ${themes[theme].border} bg-white dark:bg-gray-900/60 space-y-3`}>
                <div className="flex items-center gap-2 font-bold text-sm text-blue-600 dark:text-blue-400">
                  <Sparkles className="w-4 h-4" />
                  用法 2：连接 AI Agent（Claude / Cursor / Chrome DevTools MCP）
                </div>
                <div className={`space-y-2 ${themes[theme].text} opacity-85`}>
                  <p>
                    <strong>Chrome DevTools MCP 或支持 WebMCP 的浏览器扩展</strong>：
                    在扩展开启状态下访问本站，扩展的 MCP 客户端会自动握手发现工具集，AI 对话中即可直接调度查询持仓、切换账户与查询订单。
                  </p>
                  <p>
                    <strong>跨页面 / Iframe 嵌入调用</strong>：
                    外部系统通过 <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">iframe</code> 嵌入本站时，WebMCP 底层自动启用 <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">IframeChildTransport</code>，支持通过 postMessage 与父窗口 MCP Bridge 进行标准通信。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`px-6 py-3 border-t ${themes[theme].border} bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between text-xs`}>
          <a
            href="https://webmachinelearning.github.io/webmcp/"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
          >
            <span>W3C WebMCP 规范文档</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-white text-xs font-medium transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
