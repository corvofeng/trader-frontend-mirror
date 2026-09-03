import { describe, it, expect } from 'vitest';
import {
  cleanPortfolioHistoryPoints,
  filterHistoryByRange,
  GOOGLE_SHEET_URL,
  MAIN_ACCOUNT_ALIAS,
} from '../OptionPortfolioHistoryChart';
import type { PortfolioHistoryItem } from '../../../../lib/services/types';

describe('OptionPortfolioHistoryChart utilities', () => {
  const sampleItems: PortfolioHistoryItem[] = [
    {
      id: 1,
      date: '2025-05-13',
      capital_inflow: 500,
      allocation_flow: 0,
      total_inflow: 500,
      reported_total_inflow: 500,
      pure_cash_investment: 500,
      occupied_assets: 0,
      option_account_assets: null,
      reported_total_assets: null,
      calculated_total_assets: null,
      reported_profit: null,
      calculated_profit: null, // null profit should be ignored
    },
    {
      id: 7,
      date: '2025-07-21',
      capital_inflow: 5000,
      allocation_flow: 0,
      total_inflow: 65000,
      reported_total_inflow: 65000,
      pure_cash_investment: 44000,
      occupied_assets: 21000,
      option_account_assets: 47691,
      reported_total_assets: 68691,
      calculated_total_assets: 68691,
      reported_profit: 3691,
      calculated_profit: 3691,
    },
    {
      id: 8,
      date: '2025-08-06',
      capital_inflow: 0,
      allocation_flow: 0,
      total_inflow: 65000,
      reported_total_inflow: 65000,
      pure_cash_investment: 44000,
      occupied_assets: 21000,
      option_account_assets: 49688.9,
      reported_total_assets: 70688.9,
      calculated_total_assets: 70688.9,
      reported_profit: 5688.9,
      calculated_profit: 5688.9,
    },
    {
      id: 17,
      date: '2025-08-28',
      capital_inflow: 0,
      allocation_flow: -111500,
      total_inflow: 170000,
      reported_total_inflow: 170000,
      pure_cash_investment: 37500,
      occupied_assets: 132500,
      option_account_assets: 47675.25,
      reported_total_assets: 180175.25,
      calculated_total_assets: 180175.25,
      reported_profit: 10175.25,
      calculated_profit: 10175.25,
    },
    {
      id: 37,
      date: '2026-06-15',
      capital_inflow: 0,
      allocation_flow: 0,
      total_inflow: 562500,
      reported_total_inflow: 562500,
      pure_cash_investment: 189500,
      occupied_assets: 373000,
      option_account_assets: 184766,
      reported_total_assets: 557766,
      calculated_total_assets: 557766,
      reported_profit: -4734,
      calculated_profit: -4734, // Exact sample from user prompt
    },
    // Duplicate date on 2026-06-15 with newer id to verify deduplication
    {
      id: 38,
      date: '2026-06-15',
      capital_inflow: 0,
      allocation_flow: 0,
      total_inflow: 562500,
      reported_total_inflow: 562500,
      pure_cash_investment: 189500,
      occupied_assets: 373000,
      option_account_assets: 184766,
      reported_total_assets: 557766,
      calculated_total_assets: 557766,
      reported_profit: -4734,
      calculated_profit: -4734,
      note: 'latest snapshot of same day',
    },
  ];

  it('filters out null calculated_profit and sorts items chronologically', () => {
    const cleaned = cleanPortfolioHistoryPoints(sampleItems);
    expect(cleaned.length).toBe(4);
    // First item with null calculated_profit (2025-05-13) should be filtered out
    expect(cleaned[0].date).toBe('2025-07-21');
    expect(cleaned[0].calculated_profit).toBe(3691);
  });

  it('deduplicates multiple entries for the same date keeping the latest', () => {
    const cleaned = cleanPortfolioHistoryPoints(sampleItems);
    const dateCounts = cleaned.filter((p) => p.date === '2026-06-15');
    expect(dateCounts.length).toBe(1);
    expect(dateCounts[0].id).toBe(38);
    expect(dateCounts[0].calculated_profit).toBe(-4734);
  });

  it('guarantees strictly increasing dates for TradingView lightweight-charts', () => {
    const cleaned = cleanPortfolioHistoryPoints(sampleItems);
    for (let i = 1; i < cleaned.length; i++) {
      expect(cleaned[i].date > cleaned[i - 1].date).toBe(true);
    }
  });

  it('filters by time range correctly', () => {
    const cleaned = cleanPortfolioHistoryPoints(sampleItems);
    const all = filterHistoryByRange(cleaned, 'all');
    expect(all.length).toBe(4);

    const filtered3m = filterHistoryByRange(cleaned, '3m');
    // Anchor date is 2026-06-15, 3m ago is 2026-03-15
    expect(filtered3m.length).toBe(1);
    expect(filtered3m[0].date).toBe('2026-06-15');
  });

  it('handles empty input gracefully', () => {
    expect(cleanPortfolioHistoryPoints([])).toEqual([]);
    expect(filterHistoryByRange([], '1y')).toEqual([]);
  });

  it('defines the correct Google Sheet source URL and main account alias', () => {
    expect(MAIN_ACCOUNT_ALIAS).toBe('gjzq_option');
    expect(GOOGLE_SHEET_URL).toBe(
      'https://docs.google.com/spreadsheets/d/1GIEYV35WYDs7yqjiCBycGmuD8FG-ZXKyhI2sd8B9TFA/edit?gid=690486552#gid=690486552'
    );
  });
});
