export const OPTIONS_TABS = ['data', 'portfolio', 'analysis', 'trading', 'management', 'whitelist', 'expiry-risk', 'risk', 'market-state'] as const;
export type OptionsTab = (typeof OPTIONS_TABS)[number];
export const OPTIONS_DEFAULT_TAB: OptionsTab = 'data';

export const ADMIN_TABS = ['operations', 'calendar', 'analysis', 'history', 'tasks', 'notices', 'accounts', 'upload'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
export const ADMIN_DEFAULT_TAB: AdminTab = 'operations';

export const normalizeTab = <T extends readonly string[]>(allowed: T, def: T[number], raw: string | null | undefined) => {
  if (typeof raw !== 'string') return def;
  const s = raw.trim();
  if (!s) return def;
  return (allowed as readonly string[]).includes(s) ? (s as T[number]) : def;
};
