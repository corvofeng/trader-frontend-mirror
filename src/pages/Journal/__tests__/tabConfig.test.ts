import { describe, expect, it } from 'vitest';
import {
  buildJournalSearch,
  getJournalTabDefinitions,
  resolveJournalTab,
} from '../tabConfig';

const toSearchObject = (search: string) =>
  Object.fromEntries(new URLSearchParams(search).entries());

describe('Journal tab config', () => {
  it('filters tabs by visibility from a single config source', () => {
    expect(getJournalTabDefinitions({ canViewTradePlans: false }).map((tab) => tab.id)).toEqual(['portfolio', 'history', 'orders']);
    expect(getJournalTabDefinitions({ canViewTradePlans: true }).map((tab) => tab.id)).toEqual(['portfolio', 'trades', 'history', 'orders']);
  });

  it('normalizes tab ids against allowed tabs', () => {
    expect(resolveJournalTab('trades', { canViewTradePlans: true })).toBe('trades');
    expect(resolveJournalTab('trades', { canViewTradePlans: false })).toBe('portfolio');
    expect(resolveJournalTab('history', { canViewTradePlans: false })).toBe('history');
    expect(resolveJournalTab('orders', { canViewTradePlans: false })).toBe('orders');
    expect(resolveJournalTab('unknown', { canViewTradePlans: true })).toBe('portfolio');
  });

  it('builds journal search by preserving unrelated params and syncing tab/account', () => {
    const search = buildJournalSearch({
      currentSearch: '?foo=1&tab=portfolio&account_alias=old',
      activeTab: 'trades',
      selectedAccountId: 'main_account',
      portfolioUuid: null,
      canViewTradePlans: true,
    });

    expect(toSearchObject(search)).toEqual({
      foo: '1',
      tab: 'trades',
      account_alias: 'main_account',
    });
  });

  it('drops account_alias when there is no selected account in normal journal view', () => {
    const search = buildJournalSearch({
      currentSearch: '?tab=trades&account_alias=old',
      activeTab: 'trades',
      selectedAccountId: null,
      portfolioUuid: null,
      canViewTradePlans: true,
    });

    expect(toSearchObject(search)).toEqual({
      tab: 'trades',
    });
  });

  it('keeps existing account_alias untouched in shared portfolio view', () => {
    const search = buildJournalSearch({
      currentSearch: '?tab=portfolio&account_alias=shared_alias&uuid=abc',
      activeTab: 'portfolio',
      selectedAccountId: 'ignored',
      portfolioUuid: 'abc',
      canViewTradePlans: true,
    });

    expect(toSearchObject(search)).toEqual({
      tab: 'portfolio',
      account_alias: 'shared_alias',
      uuid: 'abc',
    });
  });
});
