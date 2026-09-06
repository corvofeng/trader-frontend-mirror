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

interface WebMcpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  pageTitle?: string;
  customTools?: WebMcpToolItem[];
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
};

export function WebMcpGuideModal({
  isOpen,
  onClose,
  theme,
  pageTitle = '当前页面',
  customTools,
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

  // Discover registered tools from navigator.modelContextTesting if available
  const availableTools: WebMcpToolItem[] = useMemo(() => {
    if (customTools && customTools.length > 0) {
      return customTools;
    }

    if (typeof window !== 'undefined') {
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

    return [];
  }, [customTools, isOpen]);

  const toolNamesList = useMemo(() => {
    return availableTools.map((t) => t.name).join(', ');
  }, [availableTools]);

  const aiPrompts = useMemo(() => {
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

      const testing = (window.navigator as unknown as {
        modelContextTesting?: {
          executeTool?: (name: string, argsJson: string) => Promise<unknown>;
        };
      }).modelContextTesting;

      if (typeof testing?.executeTool === 'function') {
        const result = await testing.executeTool(toolName, JSON.stringify(parsedArgs));
        setToolResults((prev) => ({
          ...prev,
          [toolName]: { status: 'success', data: result },
        }));
        toast.success(`工具 ${toolName} 执行成功！`);
      } else {
        throw new Error('当前浏览器环境未检测到 navigator.modelContextTesting 运行时');
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

  const consoleAllToolsSnippet = `// 1. 列出当前网页注册的所有 WebMCP 工具
console.table(navigator.modelContextTesting?.listTools());`;

  const consoleSampleRunSnippet = `// 2. 调用指定工具（以查询账户为例）
const res = await navigator.modelContextTesting?.executeTool('journal_list_accounts', '{}');
console.log(JSON.parse(res.content[0].text));`;

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
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  已就绪
                </span>
              </div>
              <p className={`text-xs ${themes[theme].text} opacity-60 mt-0.5`}>
                当前 Host: <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">{currentHost}</span> · {pageTitle}已挂载 {availableTools.length} 项标准工具
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
                    const executionSnippet = `await navigator.modelContextTesting?.executeTool('${tool.name}', ${JSON.stringify(currentArgs.replace(/\s+/g, ' '))});`;
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
                  按 <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 font-mono">F12</kbd> 打开 DevTools Console，可直接使用标准测试桩 <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">navigator.modelContextTesting</code>：
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
