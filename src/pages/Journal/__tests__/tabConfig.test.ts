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
    expect(getJournalTabDefinitions({ isAuthenticated: false }).map((tab) => tab.id)).toEqual(['portfolio']);
    expect(getJournalTabDefinitions({}).map((tab) => tab.id)).toEqual(['portfolio']);
    expect(getJournalTabDefinitions({ isAuthenticated: true }).map((tab) => tab.id)).toEqual(['portfolio', 'trades', 'history', 'orders']);
    expect(getJournalTabDefinitions({ canViewTradePlans: false, canViewHistory: true, canViewOrders: true }).map((tab) => tab.id)).toEqual(['portfolio', 'history', 'orders']);
  });

  it('normalizes tab ids against allowed tabs for anonymous and authenticated users', () => {
    // Authenticated user
    expect(resolveJournalTab('trades', { isAuthenticated: true })).toBe('trades');
    expect(resolveJournalTab('history', { isAuthenticated: true })).toBe('history');
    expect(resolveJournalTab('orders', { isAuthenticated: true })).toBe('orders');
    expect(resolveJournalTab('portfolio', { isAuthenticated: true })).toBe('portfolio');
    expect(resolveJournalTab('unknown', { isAuthenticated: true })).toBe('portfolio');

    // Anonymous user (trades, history, orders not accessible)
    expect(resolveJournalTab('trades', { isAuthenticated: false })).toBe('portfolio');
    expect(resolveJournalTab('history', { isAuthenticated: false })).toBe('portfolio');
    expect(resolveJournalTab('orders', { isAuthenticated: false })).toBe('portfolio');
    expect(resolveJournalTab('portfolio', { isAuthenticated: false })).toBe('portfolio');
    expect(resolveJournalTab('unknown', { isAuthenticated: false })).toBe('portfolio');
  });

  it('builds journal search by preserving unrelated params and syncing tab/account', () => {
    const search = buildJournalSearch({
      currentSearch: '?foo=1&tab=portfolio&account_alias=old',
      activeTab: 'trades',
      selectedAccountId: 'main_account',
      portfolioUuid: null,
      isAuthenticated: true,
    });

    expect(toSearchObject(search)).toEqual({
      foo: '1',
      tab: 'trades',
      account_alias: 'main_account',
    });
  });

  it('normalizes tab to portfolio in search when anonymous user attempts to access history or orders', () => {
    const search = buildJournalSearch({
      currentSearch: '?tab=orders&account_alias=main_account',
      activeTab: 'orders',
      selectedAccountId: 'main_account',
      portfolioUuid: null,
      isAuthenticated: false,
    });

    expect(toSearchObject(search)).toEqual({
      tab: 'portfolio',
      account_alias: 'main_account',
    });
  });

  it('drops account_alias when there is no selected account in normal journal view', () => {
    const search = buildJournalSearch({
      currentSearch: '?tab=trades&account_alias=old',
      activeTab: 'trades',
      selectedAccountId: null,
      portfolioUuid: null,
      isAuthenticated: true,
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
      isAuthenticated: true,
    });

    expect(toSearchObject(search)).toEqual({
      tab: 'portfolio',
      account_alias: 'shared_alias',
      uuid: 'abc',
    });
  });
});
