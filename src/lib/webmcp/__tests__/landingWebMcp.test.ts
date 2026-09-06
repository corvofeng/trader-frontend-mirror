import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { registerLandingWebMcpTools, type LandingWebMcpContext } from '../landingWebMcp';
import { accountService, portfolioService } from '../../services';

describe('Landing WebMCP tools', () => {
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

  it('registers all 6 landing WebMCP tools on document.modelContext', () => {
    const context: LandingWebMcpContext = {
      userId: 'test-user',
      currentTheme: 'light',
      currentLang: 'zh',
      onNavigate: vi.fn(),
      onThemeChange: vi.fn(),
      onLanguageChange: vi.fn(),
    };

    const result = registerLandingWebMcpTools(context);

    expect(result.toolNames).toEqual([
      'landing_get_overview',
      'landing_navigate',
      'landing_list_accounts',
      'landing_get_portfolio_preview',
      'landing_switch_language',
      'landing_switch_theme',
    ]);
    expect(registeredTools).toHaveLength(6);
  });

  it('executes landing_navigate and triggers context onNavigate', async () => {
    const onNavigate = vi.fn();
    const context: LandingWebMcpContext = {
      userId: 'test-user',
      currentTheme: 'light',
      currentLang: 'zh',
      onNavigate,
      onThemeChange: vi.fn(),
      onLanguageChange: vi.fn(),
    };

    registerLandingWebMcpTools(context);
    const navTool = registeredTools.find((t) => t.name === 'landing_navigate');
    expect(navTool).toBeDefined();

    const res = await navTool!.execute({ path: '/journal?tab=history' });
    expect(onNavigate).toHaveBeenCalledWith('/journal?tab=history');
    expect(JSON.parse(res.content[0].text)).toMatchObject({
      success: true,
      targetPath: '/journal?tab=history',
    });
  });

  it('executes landing_get_overview and returns overview with modules', async () => {
    const context: LandingWebMcpContext = {
      userId: 'test-user',
      currentTheme: 'dark',
      currentLang: 'en',
      onNavigate: vi.fn(),
      onThemeChange: vi.fn(),
      onLanguageChange: vi.fn(),
    };

    registerLandingWebMcpTools(context);
    const overviewTool = registeredTools.find((t) => t.name === 'landing_get_overview');
    const res = await overviewTool!.execute({});
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.app_name).toBe('Stock Trading Platform');
    expect(parsed.current_language).toBe('en');
    expect(parsed.current_theme).toBe('dark');
    expect(parsed.modules.length).toBeGreaterThanOrEqual(4);
  });

  it('executes landing_switch_language and landing_switch_theme', async () => {
    const onLanguageChange = vi.fn();
    const onThemeChange = vi.fn();
    const context: LandingWebMcpContext = {
      userId: null,
      currentTheme: 'light',
      currentLang: 'zh',
      onNavigate: vi.fn(),
      onThemeChange,
      onLanguageChange,
    };

    registerLandingWebMcpTools(context);
    const langTool = registeredTools.find((t) => t.name === 'landing_switch_language');
    const themeTool = registeredTools.find((t) => t.name === 'landing_switch_theme');

    await langTool!.execute({ lang: 'en' });
    expect(onLanguageChange).toHaveBeenCalledWith('en');

    await themeTool!.execute({ theme: 'blue' });
    expect(onThemeChange).toHaveBeenCalledWith('blue');
  });

  it('executes landing_get_portfolio_preview and calls portfolioService', async () => {
    vi.spyOn(accountService, 'getAccounts').mockResolvedValueOnce({
      data: [{ id: 'acc-1', alias: 'main', is_default: true, broker: '', branch: '', account_no: '' }],
      error: null,
    } as never);
    vi.spyOn(portfolioService, 'getHoldings').mockResolvedValueOnce({
      data: [{ stock_code: '588000.SH', stock_name: '科创50', volume: 1000 }],
      isSnapshot: true,
      error: null,
    } as never);

    const context: LandingWebMcpContext = {
      userId: null,
      currentTheme: 'light',
      currentLang: 'zh',
      onNavigate: vi.fn(),
      onThemeChange: vi.fn(),
      onLanguageChange: vi.fn(),
    };

    registerLandingWebMcpTools(context);
    const previewTool = registeredTools.find((t) => t.name === 'landing_get_portfolio_preview');
    const res = await previewTool!.execute({});
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.account_alias).toBe('main');
    expect(parsed.holdings_count).toBe(1);
    expect(parsed.is_snapshot).toBe(true);
  });
});
