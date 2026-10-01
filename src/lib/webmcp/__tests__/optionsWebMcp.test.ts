import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { registerOptionsWebMcpTools, type OptionsWebMcpContext } from '../optionsWebMcp';
import { optionsService } from '../../services';

describe('Options WebMCP tools', () => {
  let registeredTools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
  }>;

  beforeEach(() => {
    registeredTools = [];
    const mockRegisterTool = vi.fn().mockImplementation((tool) => {
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

  it('registers all 6 options WebMCP tools', () => {
    const context: OptionsWebMcpContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-opt',
      selectedSymbol: '588000.SH',
      activeTab: 'data',
      isAuthenticated: true,
      onSelectSymbol: vi.fn(),
      onSwitchTab: vi.fn(),
      onSelectAccount: vi.fn(),
    };

    const res = registerOptionsWebMcpTools(context);
    expect(res.toolNames).toEqual([
      'options_get_overview',
      'options_list_symbols',
      'options_get_portfolio',
      'options_get_market_state',
      'options_switch_tab',
      'options_select_symbol',
    ]);
    expect(registeredTools).toHaveLength(6);
  });

  it('executes options_get_overview and returns context info', async () => {
    const context: OptionsWebMcpContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-opt',
      selectedSymbol: '588000.SH',
      activeTab: 'portfolio',
      isAuthenticated: true,
    };

    registerOptionsWebMcpTools(context);
    const overviewTool = registeredTools.find((t) => t.name === 'options_get_overview');
    const res = await overviewTool!.execute({});
    const data = JSON.parse(res.content[0].text);

    expect(data.success).toBe(true);
    expect(data.selected_account).toBe('acc-opt');
    expect(data.selected_symbol).toBe('588000.SH');
    expect(data.active_tab).toBe('portfolio');
  });

  it('executes options_switch_tab and triggers callback', async () => {
    const onSwitchTab = vi.fn();
    const context: OptionsWebMcpContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-opt',
      selectedSymbol: '588000.SH',
      activeTab: 'data',
      onSwitchTab,
    };

    registerOptionsWebMcpTools(context);
    const switchTool = registeredTools.find((t) => t.name === 'options_switch_tab');
    const res = await switchTool!.execute({ tab: 'risk' });
    const data = JSON.parse(res.content[0].text);

    expect(data.success).toBe(true);
    expect(onSwitchTab).toHaveBeenCalledWith('risk');
  });

  it('executes options_select_symbol and validates input', async () => {
    const onSelectSymbol = vi.fn();
    const context: OptionsWebMcpContext = {
      userId: 'test-user',
      selectedAccountId: 'acc-opt',
      selectedSymbol: '588000.SH',
      activeTab: 'data',
      onSelectSymbol,
    };

    registerOptionsWebMcpTools(context);
    const selectTool = registeredTools.find((t) => t.name === 'options_select_symbol');

    const emptyRes = await selectTool!.execute({ symbol: '' });
    expect(JSON.parse(emptyRes.content[0].text)).toMatchObject({
      success: false,
      error: 'INVALID_PARAM',
    });

    const validRes = await selectTool!.execute({ symbol: '510050.SH' });
    expect(JSON.parse(validRes.content[0].text)).toMatchObject({
      success: true,
      selectedSymbol: '510050.SH',
    });
    expect(onSelectSymbol).toHaveBeenCalledWith('510050.SH');
  });
});
