const normalizeValue = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
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

export const getFirstCookieValue = (keys: string[]) => {
  for (const key of keys) {
    const value = getCookieValue(key);
    if (value) return value;
  }
  return null;
};

export const getPreferredAccountAlias = (options: {
  search?: string;
  localStorageKeys?: string[];
  cookieKeys?: string[];
}) => {
  return getAccountAliasFromSearch(options.search)
    || getFirstLocalStorageValue(options.localStorageKeys || [])
    || getFirstCookieValue(options.cookieKeys || [])
    || null;
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
