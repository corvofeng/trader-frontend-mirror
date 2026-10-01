import { useEffect, useRef, useState } from 'react';
import { registerAdminWebMcpTools, type AdminWebMcpContext } from '../../../lib/webmcp/adminWebMcp';

export interface UseAdminWebMcpOptions extends AdminWebMcpContext {
  enabled?: boolean;
}

export function useAdminWebMcp(options: UseAdminWebMcpOptions) {
  const {
    userId,
    selectedAccountId,
    activeTab,
    isAuthenticated,
    onSwitchTab,
    onSelectAccount,
    enabled = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [registeredToolCount, setRegisteredToolCount] = useState(0);
  const [tools, setTools] = useState<import('../../../lib/webmcp/landingWebMcp').WebMcpToolDescriptor[]>([]);

  const contextRef = useRef<AdminWebMcpContext>({
    userId,
    selectedAccountId,
    activeTab,
    isAuthenticated,
    onSwitchTab,
    onSelectAccount,
  });

  useEffect(() => {
    contextRef.current = {
      userId,
      selectedAccountId,
      activeTab,
      isAuthenticated,
      onSwitchTab,
      onSelectAccount,
    };
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const hasModelContext =
      (typeof document !== 'undefined' && 'modelContext' in document) ||
      'modelContext' in window ||
      (typeof navigator !== 'undefined' && 'modelContext' in navigator);
    setIsSupported(Boolean(hasModelContext));

    const controller = new AbortController();

    const proxyContext: AdminWebMcpContext = {
      get userId() {
        return contextRef.current.userId;
      },
      get selectedAccountId() {
        return contextRef.current.selectedAccountId;
      },
      get activeTab() {
        return contextRef.current.activeTab;
      },
      get isAuthenticated() {
        return contextRef.current.isAuthenticated;
      },
      onSwitchTab: (tab) => contextRef.current.onSwitchTab?.(tab),
      onSelectAccount: (accountId) => contextRef.current.onSelectAccount?.(accountId),
    };

    const registration = registerAdminWebMcpTools(proxyContext, controller.signal);
    setRegisteredToolCount(registration.toolNames.length);
    setTools(registration.tools);

    void registration.registrationPromise.then((count) => {
      if (!controller.signal.aborted) {
        setRegisteredToolCount(count);
      }
    });

    return () => {
      controller.abort();
    };
  }, [enabled]);

  return {
    isSupported,
    registeredToolCount,
    tools,
  };
}
