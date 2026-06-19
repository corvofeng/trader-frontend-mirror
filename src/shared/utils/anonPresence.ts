import { getFirstLocalStorageValue } from './accountSelection';
import { ADMIN_DEFAULT_TAB, ADMIN_TABS, OPTIONS_DEFAULT_TAB, OPTIONS_TABS, normalizeTab } from './tabRouting';
import { resolveJournalTab } from '../../pages/Journal/tabConfig';

type AnonPresenceSnapshot = {
  anon_id: string;
  full_path: string;
  path: string;
  search: string;
  page_title: string;
  account_alias: string | null;
  tab: string;
  ts: number;
};

const ANON_ID_STORAGE_KEY = 'anon_id';
const ANON_PRESENCE_STORAGE_KEY = 'anon_presence';
const ANON_FULL_PATH_STORAGE_KEY = 'anon_full_path';
const ANON_PATH_STORAGE_KEY = 'anon_path';
const ANON_SEARCH_STORAGE_KEY = 'anon_search';
const ANON_PAGE_TITLE_STORAGE_KEY = 'anon_page_title';
const ANON_ACCOUNT_ALIAS_STORAGE_KEY = 'anon_account_alias';
const ANON_TAB_STORAGE_KEY = 'anon_tab';
const ANON_TS_STORAGE_KEY = 'anon_ts';

const sanitizeString = (value: string | null, maxLen: number) => {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const sanitizeAccountAlias = (value: string | null) => {
  const s = sanitizeString(value, 64);
  if (!s) return null;
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null;
};

const resolveTab = (pathname: string, tabRaw: string | null) => {
  if (pathname.startsWith('/options')) {
    return normalizeTab(OPTIONS_TABS, OPTIONS_DEFAULT_TAB, tabRaw);
  }
  if (pathname.startsWith('/admin')) {
    return normalizeTab(ADMIN_TABS, ADMIN_DEFAULT_TAB, tabRaw);
  }
  if (pathname.startsWith('/journal')) {
    return resolveJournalTab(tabRaw, { canViewTradePlans: true });
  }

  return sanitizeString(tabRaw, 32) || '';
};

const readLocalStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocalStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

const setCookie = (key: string, value: string, days: number) => {
  try {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    document.cookie = `${key}=${encodeURIComponent(value)}; expires=${expiry.toUTCString()}; path=/; samesite=lax`;
  } catch {}
};

const generateAnonId = () => {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = c?.getRandomValues ? c.getRandomValues(new Uint8Array(16)) : null;
  if (!bytes) return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
};

export const getOrCreateAnonId = () => {
  const existing = readLocalStorage(ANON_ID_STORAGE_KEY);
  if (existing && existing.trim()) return existing.trim();
  const next = generateAnonId();
  writeLocalStorage(ANON_ID_STORAGE_KEY, next);
  setCookie(ANON_ID_STORAGE_KEY, next, 180);
  return next;
};

export const updateAnonPresence = (input: { pathname: string; search: string }) => {
  if (typeof window === 'undefined') return;
  const anonId = getOrCreateAnonId();
  const fullPath = `${input.pathname}${input.search || ''}`;
  const params = new URLSearchParams(input.search.startsWith('?') ? input.search.slice(1) : input.search);
  const pageTitle = sanitizeString(typeof document !== 'undefined' ? (document.title || '') : '', 200) || '';
  const accountAlias = sanitizeAccountAlias(
    params.get('account_alias') || getFirstLocalStorageValue([
    'adminSelectedAccountAlias',
    'adminAccountId',
    'journalSelectedAccountAlias',
    'journalAccountId',
    'optionsSelectedAccountAlias',
    'selectedAccountAlias',
    'selectedAccountId',
  ])
  );
  const tab = resolveTab(input.pathname, params.get('tab'));
  const ts = Date.now();

  const snapshot: AnonPresenceSnapshot = {
    anon_id: anonId,
    full_path: fullPath,
    path: input.pathname,
    search: input.search || '',
    page_title: pageTitle,
    account_alias: accountAlias,
    tab,
    ts,
  };
  writeLocalStorage(ANON_PRESENCE_STORAGE_KEY, JSON.stringify(snapshot));
  writeLocalStorage(ANON_FULL_PATH_STORAGE_KEY, snapshot.full_path);
  writeLocalStorage(ANON_PATH_STORAGE_KEY, snapshot.path);
  writeLocalStorage(ANON_SEARCH_STORAGE_KEY, snapshot.search);
  writeLocalStorage(ANON_PAGE_TITLE_STORAGE_KEY, snapshot.page_title);
  writeLocalStorage(ANON_ACCOUNT_ALIAS_STORAGE_KEY, snapshot.account_alias || '');
  writeLocalStorage(ANON_TAB_STORAGE_KEY, snapshot.tab);
  writeLocalStorage(ANON_TS_STORAGE_KEY, String(snapshot.ts));
};

export const updateAnonPresenceWithTitleRetry = (input: { pathname: string; search: string }) => {
  updateAnonPresence(input);
  try {
    window.setTimeout(() => updateAnonPresence(input), 0);
    window.setTimeout(() => updateAnonPresence(input), 500);
  } catch {}
};
