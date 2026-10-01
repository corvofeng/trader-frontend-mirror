import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { registerAdminWebMcpTools, type AdminWebMcpContext } from '../adminWebMcp';
import { cashFlowService, operationService } from '../../services';

describe('Admin WebMCP tools', () => {
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

  it('registers all 4 admin WebMCP tools', () => {
    const context: AdminWebMcpContext = {
      userId: 'admin-user',
      selectedAccountId: 'acc-admin',
      activeTab: 'operations',
      isAuthenticated: true,
      onSwitchTab: vi.fn(),
      onSelectAccount: vi.fn(),
    };

    const res = registerAdminWebMcpTools(context);
    expect(res.toolNames).toEqual([
      'admin_get_system_status',
      'admin_get_cash_flow_summary',
      'admin_get_operations',
      'admin_switch_tab',
    ]);
    expect(registeredTools).toHaveLength(4);
  });

  it('executes admin_get_system_status and indicates auth status', async () => {
    const unauthedContext: AdminWebMcpContext = {
      userId: null,
      selectedAccountId: null,
      activeTab: 'operations',
      isAuthenticated: false,
    };

    registerAdminWebMcpTools(unauthedContext);
    const statusTool = registeredTools.find((t) => t.name === 'admin_get_system_status');
    const res = await statusTool!.execute({});
    const data = JSON.parse(res.content[0].text);

    expect(data.success).toBe(true);
    expect(data.is_authenticated).toBe(false);
  });

  it('blocks admin_get_cash_flow_summary when unauthenticated with AUTH_REQUIRED', async () => {
    const unauthedContext: AdminWebMcpContext = {
      userId: null,
      selectedAccountId: 'main',
      activeTab: 'cash-flows',
      isAuthenticated: false,
    };

    registerAdminWebMcpTools(unauthedContext);
    const cashFlowTool = registeredTools.find((t) => t.name === 'admin_get_cash_flow_summary');
    const res = await cashFlowTool!.execute({ account_alias: 'main' });
    const data = JSON.parse(res.content[0].text);

    expect(data.success).toBe(false);
    expect(data.error).toBe('AUTH_REQUIRED');
  });

  it('blocks admin_switch_tab when unauthenticated with AUTH_REQUIRED', async () => {
    const onSwitchTab = vi.fn();
    const unauthedContext: AdminWebMcpContext = {
      userId: null,
      selectedAccountId: null,
      activeTab: 'operations',
      isAuthenticated: false,
      onSwitchTab,
    };

    registerAdminWebMcpTools(unauthedContext);
    const switchTool = registeredTools.find((t) => t.name === 'admin_switch_tab');
    const res = await switchTool!.execute({ tab: 'tasks' });
    const data = JSON.parse(res.content[0].text);

    expect(data.success).toBe(false);
    expect(data.error).toBe('AUTH_REQUIRED');
    expect(onSwitchTab).not.toHaveBeenCalled();
  });
});
