const normalizeValue = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export type AccountSelectionStorage = {
  resolveLocalStorageKeys: string[];
  resolveCookieKeys: string[];
  persistLocalStorageKeys: string[];
  persistCookieKey?: string;
};

export type ResolvedAccountAlias = {
  value: string | null;
  source: 'search' | 'localStorage' | 'cookie' | null;
  key: string | null;
};

export const JOURNAL_ACCOUNT_STORAGE: AccountSelectionStorage = {
  resolveLocalStorageKeys: ['journalSelectedAccountAlias', 'selectedAccountAlias', 'journalAccountId', 'selectedAccountId'],
  resolveCookieKeys: ['journalAccountId'],
  persistLocalStorageKeys: ['journalSelectedAccountAlias', 'journalAccountId'],
  persistCookieKey: 'journalAccountId',
};

export const OPTIONS_ACCOUNT_STORAGE: AccountSelectionStorage = {
  resolveLocalStorageKeys: ['optionsSelectedAccountAlias', 'optionsSelectedAccountId', 'selectedAccountAlias', 'selectedAccountId'],
  resolveCookieKeys: ['optionsSelectedAccountId', 'selectedAccountId'],
  persistLocalStorageKeys: ['optionsSelectedAccountAlias', 'optionsSelectedAccountId'],
  persistCookieKey: 'optionsSelectedAccountId',
};

export const ADMIN_ACCOUNT_STORAGE: AccountSelectionStorage = {
  resolveLocalStorageKeys: [
    'adminSelectedAccountAlias',
    'adminAccountId',
    'optionsSelectedAccountAlias',
    'journalSelectedAccountAlias',
    'selectedAccountAlias',
    'selectedAccountId',
  ],
  resolveCookieKeys: ['adminAccountId'],
  persistLocalStorageKeys: ['adminSelectedAccountAlias', 'adminAccountId'],
  persistCookieKey: 'adminAccountId',
};

const getCookieValue = (key: string) => {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));
  if (!match) return null;
  const raw = match.slice(key.length + 1);
  try {
    return normalizeValue(decodeURIComponent(raw));
  } catch {
    return normalizeValue(raw);
  }
};

export const getAccountAliasFromSearch = (search?: string) => {
  const resolvedSearch = typeof search === 'string'
    ? search
    : (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(resolvedSearch.startsWith('?') ? resolvedSearch.slice(1) : resolvedSearch);
  return normalizeValue(params.get('account_alias'));
};

export const getFirstLocalStorageValue = (keys: string[]) => {
  if (typeof localStorage === 'undefined') return null;
  try {
    for (const key of keys) {
      const value = normalizeValue(localStorage.getItem(key));
      if (value) return value;
    }
  } catch {
    return null;
  }
  return null;
};

const inspectFirstLocalStorageValue = (keys: string[]): ResolvedAccountAlias => {
  if (typeof localStorage === 'undefined') {
    return { value: null, source: null, key: null };
  }
  try {
    for (const key of keys) {
      const value = normalizeValue(localStorage.getItem(key));
      if (value) {
        return { value, source: 'localStorage', key };
      }
    }
  } catch {
    return { value: null, source: null, key: null };
  }
  return { value: null, source: null, key: null };
};

export const getFirstCookieValue = (keys: string[]) => {
  for (const key of keys) {
    const value = getCookieValue(key);
    if (value) return value;
  }
  return null;
};

const inspectFirstCookieValue = (keys: string[]): ResolvedAccountAlias => {
  for (const key of keys) {
    const value = getCookieValue(key);
    if (value) {
      return { value, source: 'cookie', key };
    }
  }
  return { value: null, source: null, key: null };
};

const resolveStorage = (options: {
  localStorageKeys?: string[];
  cookieKeys?: string[];
  storage?: AccountSelectionStorage;
}) => ({
  localStorageKeys: options.localStorageKeys ?? options.storage?.resolveLocalStorageKeys ?? [],
  cookieKeys: options.cookieKeys ?? options.storage?.resolveCookieKeys ?? [],
});

export const inspectCurrentAccountAlias = (options: {
  search?: string;
  localStorageKeys?: string[];
  cookieKeys?: string[];
  storage?: AccountSelectionStorage;
}): ResolvedAccountAlias => {
  const fromSearch = getAccountAliasFromSearch(options.search);
  if (fromSearch) {
    return { value: fromSearch, source: 'search', key: 'account_alias' };
  }

  const storage = resolveStorage(options);
  const fromLocalStorage = inspectFirstLocalStorageValue(storage.localStorageKeys);
  if (fromLocalStorage.value) {
    return fromLocalStorage;
  }

  return inspectFirstCookieValue(storage.cookieKeys);
};

export const resolveCurrentAccountAlias = (options: {
  search?: string;
  localStorageKeys?: string[];
  cookieKeys?: string[];
  storage?: AccountSelectionStorage;
}) => inspectCurrentAccountAlias(options).value;

export const getPreferredAccountAlias = (options: {
  search?: string;
  localStorageKeys?: string[];
  cookieKeys?: string[];
  storage?: AccountSelectionStorage;
}) => {
  return resolveCurrentAccountAlias(options);
};

export const persistAccountAlias = (
  accountAlias: string | null | undefined,
  options: {
    localStorageKeys?: string[];
    cookieKey?: string;
    storage?: AccountSelectionStorage;
    cookieDays?: number;
  }
) => {
  const normalized = normalizeValue(accountAlias);
  const localStorageKeys = options.localStorageKeys ?? options.storage?.persistLocalStorageKeys ?? [];
  const cookieKey = options.cookieKey ?? options.storage?.persistCookieKey;

  if (typeof localStorage !== 'undefined') {
    try {
      for (const key of localStorageKeys) {
        if (normalized) {
          localStorage.setItem(key, normalized);
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }

  if (!cookieKey || typeof document === 'undefined') return;

  try {
    const cookieValue = normalized ? encodeURIComponent(normalized) : '';
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (options.cookieDays ?? 30));
    document.cookie = `${cookieKey}=${cookieValue}; expires=${expiryDate.toUTCString()}; path=/`;
  } catch {}
};

export const withAccountAliasInSearch = (search: string, accountAlias: string | null | undefined) => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const normalized = normalizeValue(accountAlias);
  if (normalized) {
    const current = normalizeValue(params.get('account_alias'));
    if (current !== normalized) {
      params.set('account_alias', normalized);
    }
  } else {
    params.delete('account_alias');
  }
  return params.toString();
};

export const pickSearchParams = (search: string, allowedKeys: string[]) => {
  const src = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const dst = new URLSearchParams();
  for (const key of allowedKeys) {
    const value = normalizeValue(src.get(key));
    if (value) dst.set(key, value);
  }
  return dst.toString();
};

export const checkIsMainAccount = (options: {
  selectedAccountId?: string | null;
  defaultAccountId?: string | null;
  accounts?: Array<{
    id?: string;
    alias?: string;
    name?: string;
    is_default?: boolean;
  }>;
}): boolean => {
  const { selectedAccountId, defaultAccountId, accounts } = options;
  const normalizedSelected = normalizeValue(selectedAccountId);
  if (!normalizedSelected) return true;

  if (accounts && accounts.length > 0) {
    const current = accounts.find(
      (a) => a.alias === normalizedSelected || a.id === normalizedSelected
    );
    if (current) {
      if (current.is_default) return true;
      if (current.name?.includes('主账户')) return true;
      if (current.alias?.toLowerCase().startsWith('main')) return true;
      return false;
    }
    const def = accounts.find((a) => a.is_default) || accounts[0];
    const defKey = def ? (def.alias || def.id) : null;
    if (defKey && defKey === normalizedSelected) return true;
  }

  if (defaultAccountId && normalizedSelected === defaultAccountId) {
    return true;
  }

  const lower = normalizedSelected.toLowerCase();
  return lower.startsWith('main') || lower === 'gjzq_option';
};

