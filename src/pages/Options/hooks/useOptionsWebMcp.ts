import { useEffect, useRef, useState } from 'react';
import { registerOptionsWebMcpTools, type OptionsWebMcpContext } from '../../../lib/webmcp/optionsWebMcp';

export interface UseOptionsWebMcpOptions extends OptionsWebMcpContext {
  enabled?: boolean;
}

export function useOptionsWebMcp(options: UseOptionsWebMcpOptions) {
  const {
    userId,
    selectedAccountId,
    selectedSymbol,
    activeTab,
    isAuthenticated,
    onSelectSymbol,
    onSwitchTab,
    onSelectAccount,
    getAccounts,
    enabled = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [registeredToolCount, setRegisteredToolCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [tools, setTools] = useState<import('../../../lib/webmcp/landingWebMcp').WebMcpToolDescriptor[]>([]);

  const contextRef = useRef<OptionsWebMcpContext>({
    userId,
    selectedAccountId,
    selectedSymbol,
    activeTab,
    isAuthenticated,
    onSelectSymbol,
    onSwitchTab,
    onSelectAccount,
    getAccounts,
  });

  useEffect(() => {
    contextRef.current = {
      userId,
      selectedAccountId,
      selectedSymbol,
      activeTab,
      isAuthenticated,
      onSelectSymbol,
      onSwitchTab,
      onSelectAccount,
      getAccounts,
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

    const proxyContext: OptionsWebMcpContext = {
      get userId() {
        return contextRef.current.userId;
      },
      get selectedAccountId() {
        return contextRef.current.selectedAccountId;
      },
      get selectedSymbol() {
        return contextRef.current.selectedSymbol;
      },
      get activeTab() {
        return contextRef.current.activeTab;
      },
      get isAuthenticated() {
        return contextRef.current.isAuthenticated;
      },
      onSelectSymbol: (symbol) => contextRef.current.onSelectSymbol?.(symbol),
      onSwitchTab: (tab) => contextRef.current.onSwitchTab?.(tab),
      onSelectAccount: (accountId) => contextRef.current.onSelectAccount?.(accountId),
      getAccounts: () => contextRef.current.getAccounts?.() || [],
    };

    const registration = registerOptionsWebMcpTools(proxyContext, controller.signal);
    setTools(registration.tools);

    void registration.registrationPromise.then((count) => {
      if (!controller.signal.aborted) {
        setRegisteredToolCount(count);
        setIsReady(count > 0);
      }
    });

    return () => {
      controller.abort();
    };
  }, [enabled]);

  return {
    isSupported,
    registeredToolCount,
    isReady,
    tools,
  };
}
