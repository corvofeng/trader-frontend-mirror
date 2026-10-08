export const OPTIONS_TABS = ['portfolio', 'data', 'market-state', 'analysis', 'trading', 'management', 'whitelist', 'expiry-risk', 'risk'] as const;
export type OptionsTab = (typeof OPTIONS_TABS)[number];
export const OPTIONS_DEFAULT_TAB: OptionsTab = 'portfolio';

export const ADMIN_TABS = ['operations', 'calendar', 'analysis', 'history', 'tasks', 'notices', 'accounts', 'upload', 'cash-flows'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
export const ADMIN_DEFAULT_TAB: AdminTab = 'operations';

export const normalizeTab = <T extends readonly string[]>(allowed: T, def: T[number], raw: string | null | undefined) => {
  if (typeof raw !== 'string') return def;
  let s = raw.trim();
  if (!s) return def;
  if (s === 'cash_flows' || s === 'cash-flow' || s === 'cashflow') {
    s = 'cash-flows';
  }
  return (allowed as readonly string[]).includes(s) ? (s as T[number]) : def;
};
