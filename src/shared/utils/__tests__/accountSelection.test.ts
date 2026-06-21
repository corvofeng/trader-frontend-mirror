import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inspectCurrentAccountAlias,
  JOURNAL_ACCOUNT_STORAGE,
  OPTIONS_ACCOUNT_STORAGE,
  persistAccountAlias,
  resolveCurrentAccountAlias,
} from '../accountSelection';

type StorageMap = Record<string, string>;

const createStorage = (initial: StorageMap = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
};

describe('accountSelection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers account_alias from search and records its source', () => {
    const localStorage = createStorage({ journalSelectedAccountAlias: 'journal-local' });
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', { cookie: 'journalAccountId=journal-cookie' });

    const resolved = inspectCurrentAccountAlias({
      search: '?account_alias=url-account',
      storage: JOURNAL_ACCOUNT_STORAGE,
    });

    expect(resolved).toEqual({
      value: 'url-account',
      source: 'search',
      key: 'account_alias',
    });
  });

  it('falls back to the first configured localStorage key', () => {
    const localStorage = createStorage({
      optionsSelectedAccountId: 'options-local-id',
      selectedAccountAlias: 'global-local',
    });
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', { cookie: '' });

    expect(resolveCurrentAccountAlias({ storage: OPTIONS_ACCOUNT_STORAGE })).toBe('options-local-id');
    expect(
      inspectCurrentAccountAlias({ storage: OPTIONS_ACCOUNT_STORAGE })
    ).toMatchObject({
      value: 'options-local-id',
      source: 'localStorage',
      key: 'optionsSelectedAccountId',
    });
  });

  it('falls back to cookie when search and localStorage are empty', () => {
    vi.stubGlobal('localStorage', createStorage());
    vi.stubGlobal('document', { cookie: 'optionsSelectedAccountId=options-cookie' });

    expect(
      inspectCurrentAccountAlias({ storage: OPTIONS_ACCOUNT_STORAGE })
    ).toMatchObject({
      value: 'options-cookie',
      source: 'cookie',
      key: 'optionsSelectedAccountId',
    });
  });

  it('persists the account to configured keys and supports explicit overrides', () => {
    const localStorage = createStorage();
    const document = { cookie: '' };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('document', document);

    persistAccountAlias('main-account', {
      storage: JOURNAL_ACCOUNT_STORAGE,
      localStorageKeys: ['journalSelectedAccountAlias', 'selectedAccountAlias'],
    });

    expect(localStorage.setItem).toHaveBeenCalledWith('journalSelectedAccountAlias', 'main-account');
    expect(localStorage.setItem).toHaveBeenCalledWith('selectedAccountAlias', 'main-account');
    expect(document.cookie).toContain('journalAccountId=main-account');
  });
});
