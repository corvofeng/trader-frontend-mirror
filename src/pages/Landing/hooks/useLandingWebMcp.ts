import { useEffect, useRef, useState } from 'react';
import { registerLandingWebMcpTools, type LandingWebMcpContext } from '../../../lib/webmcp/landingWebMcp';

export interface UseLandingWebMcpOptions extends LandingWebMcpContext {
  enabled?: boolean;
}

export function useLandingWebMcp(options: UseLandingWebMcpOptions) {
  const {
    userId,
    isAuthenticated,
    currentTheme,
    currentLang,
    onNavigate,
    onThemeChange,
    onLanguageChange,
    enabled = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [registeredToolCount, setRegisteredToolCount] = useState(0);
  const [tools, setTools] = useState<import('../../../lib/webmcp/landingWebMcp').WebMcpToolDescriptor[]>([]);

  const contextRef = useRef<LandingWebMcpContext>({
    userId,
    isAuthenticated,
    currentTheme,
    currentLang,
    onNavigate,
    onThemeChange,
    onLanguageChange,
  });

  useEffect(() => {
    contextRef.current = {
      userId,
      isAuthenticated,
      currentTheme,
      currentLang,
      onNavigate,
      onThemeChange,
      onLanguageChange,
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

    const proxyContext: LandingWebMcpContext = {
      get userId() {
        return contextRef.current.userId;
      },
      get isAuthenticated() {
        return contextRef.current.isAuthenticated;
      },
      get currentTheme() {
        return contextRef.current.currentTheme;
      },
      get currentLang() {
        return contextRef.current.currentLang;
      },
      onNavigate: (path) => contextRef.current.onNavigate(path),
      onThemeChange: (theme) => contextRef.current.onThemeChange(theme),
      onLanguageChange: (lang) => contextRef.current.onLanguageChange(lang),
    };

    const registration = registerLandingWebMcpTools(proxyContext, controller.signal);
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
