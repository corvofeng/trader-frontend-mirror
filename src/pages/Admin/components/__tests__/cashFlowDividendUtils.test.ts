import { describe, it, expect } from 'vitest';
import type { CashFlowItem } from '../../../../lib/services/types';
import {
  calculateCounterpartyPrincipals,
  detectReenteredCounterparties,
  calculateAnnualDividendPlan,
  simulateNewMemberEntry,
  generateDividendNoticeText,
  generatePositionNoticeText,
} from '../cashFlowDividendUtils';

describe('cashFlowDividendUtils', () => {
  const sampleItems: CashFlowItem[] = [
    {
      id: 1,
      account_alias: 'main_zjcf_qmt',
      amount: '50000.00',
      currency: 'CNY',
      counterparty: '张三',
      flow_date: '2026-02-01',
      flow_type: 'deposit',
      created_at: '2026-02-01T10:00:00',
      updated_at: '2026-02-01T10:00:00',
    },
    {
      id: 2,
      account_alias: 'main_zjcf_qmt',
      amount: '50000.00',
      currency: 'CNY',
      counterparty: '李四',
      flow_date: '2026-02-01',
      flow_type: 'deposit',
      created_at: '2026-02-01T10:00:00',
      updated_at: '2026-02-01T10:00:00',
    },
  ];

  it('calculates counterparty principals and equal 50% shares', () => {
    const principals = calculateCounterpartyPrincipals(sampleItems, 2026);
    expect(principals.length).toBe(2);

    const zhang = principals.find((p) => p.rawName === '张三');
    const li = principals.find((p) => p.rawName === '李四');

    expect(zhang).toBeDefined();
    expect(li).toBeDefined();
    expect(zhang?.netPrincipal).toBe(50000);
    expect(li?.netPrincipal).toBe(50000);
    expect(zhang?.shareRatio).toBeCloseTo(0.5);
    expect(li?.shareRatio).toBeCloseTo(0.5);
  });

  it('matches user example: 2 people 50k each, 1000 profit -> 500 gross, 50 fee, 450 net each', () => {
    const principals = calculateCounterpartyPrincipals(sampleItems, 2026);
    const plan = calculateAnnualDividendPlan({
      year: 2026,
      totalProfit: 1000,
      principals,
      standardFeeRate: 0.10,
    });

    expect(plan.isEligibleForDividend).toBe(true);
    expect(plan.totalPoolPrincipal).toBe(100000);
    expect(plan.totalGrossProfit).toBe(1000);
    expect(plan.totalManagerFee).toBe(100);
    expect(plan.totalNetDividend).toBe(900);

    const zhangItem = plan.items.find((i) => i.rawName === '张三');
    const liItem = plan.items.find((i) => i.rawName === '李四');

    expect(zhangItem?.grossProfitShare).toBe(500);
    expect(zhangItem?.feeAmount).toBe(50);
    expect(zhangItem?.netDividend).toBe(450);
    expect(zhangItem?.remainingPrincipal).toBe(50000);

    expect(liItem?.grossProfitShare).toBe(500);
    expect(liItem?.feeAmount).toBe(50);
    expect(liItem?.netDividend).toBe(450);
    expect(liItem?.remainingPrincipal).toBe(50000);
  });

  it('Rule 5: Does not distribute dividend when total profit is zero or negative', () => {
    const principals = calculateCounterpartyPrincipals(sampleItems, 2026);

    const zeroPlan = calculateAnnualDividendPlan({
      year: 2026,
      totalProfit: 0,
      principals,
    });
    expect(zeroPlan.isEligibleForDividend).toBe(false);
    expect(zeroPlan.totalNetDividend).toBe(0);

    const lossPlan = calculateAnnualDividendPlan({
      year: 2026,
      totalProfit: -5000,
      principals,
    });
    expect(lossPlan.isEligibleForDividend).toBe(false);
    expect(lossPlan.statusMessage).toContain('亏损状态');
  });

  it('Rule 4: Detects re-entered partner in the same natural year and applies 50% fee rate', () => {
    const reenterItems: CashFlowItem[] = [
      {
        id: 1,
        account_alias: 'main_zjcf_qmt',
        amount: '100000.00',
        currency: 'CNY',
        counterparty: '王五',
        flow_date: '2026-03-01',
        flow_type: 'deposit',
        created_at: '2026-03-01T10:00:00',
        updated_at: '2026-03-01T10:00:00',
      },
      {
        id: 2,
        account_alias: 'main_zjcf_qmt',
        amount: '80000.00',
        currency: 'CNY',
        counterparty: '王五',
        flow_date: '2026-04-10',
        flow_type: 'withdraw',
        created_at: '2026-04-10T10:00:00',
        updated_at: '2026-04-10T10:00:00',
      },
      {
        id: 3,
        account_alias: 'main_zjcf_qmt',
        amount: '50000.00',
        currency: 'CNY',
        counterparty: '王五',
        flow_date: '2026-05-15',
        flow_type: 'deposit',
        created_at: '2026-05-15T10:00:00',
        updated_at: '2026-05-15T10:00:00',
      },
    ];

    const reenterMap = detectReenteredCounterparties(reenterItems, 2026);
    expect(reenterMap.get('王五')?.reentered).toBe(true);

    const principals = calculateCounterpartyPrincipals(reenterItems, 2026);
    const wang = principals.find((p) => p.rawName === '王五');
    expect(wang?.hasReenteredInYear).toBe(true);
    expect(wang?.netPrincipal).toBe(70000); // 100k - 80k + 50k = 70k

    // Calculate dividend: fee rate should be 50%
    const plan = calculateAnnualDividendPlan({
      year: 2026,
      totalProfit: 10000,
      principals,
      standardFeeRate: 0.10,
      reentryFeeRate: 0.50,
    });

    const wangPlanItem = plan.items.find((i) => i.rawName === '王五');
    expect(wangPlanItem?.feeRate).toBe(0.50);
    expect(wangPlanItem?.grossProfitShare).toBe(10000);
    expect(wangPlanItem?.feeAmount).toBe(5000); // 10000 * 50%
    expect(wangPlanItem?.netDividend).toBe(5000);
  });

  it('Progressive Tiered Fee: 5% and under is charged 10%, excess over 5% is charged 50%', () => {
    // 2 people: Zhang San 50,000 (50%), Li Si 50,000 (50%)
    // Let total profit be 20,000 -> each gets 10,000 gross profit.
    // Zhang San's principal = 50,000. 5% threshold = 2,500.
    // Gross profit = 10,000 (20% return > 5%).
    // Tier 1 (within 5%): 2,500 * 10% = 250
    // Tier 2 (excess over 5%): 7,500 * 50% = 3,750
    // Total Fee = 250 + 3,750 = 4,000 (Effective fee rate 40%)
    // Net Dividend = 10,000 - 4,000 = 6,000
    const principals = calculateCounterpartyPrincipals(sampleItems, 2026);
    const plan = calculateAnnualDividendPlan({
      year: 2026,
      totalProfit: 20000,
      principals,
      feeMode: 'progressive',
    });

    expect(plan.isEligibleForDividend).toBe(true);
    expect(plan.totalGrossProfit).toBe(20000);
    expect(plan.totalManagerFee).toBe(8000); // 4000 + 4000
    expect(plan.totalNetDividend).toBe(12000); // 6000 + 6000

    const zhang = plan.items.find((i) => i.rawName === '张三');
    expect(zhang).toBeDefined();
    expect(zhang?.grossProfitShare).toBe(10000);
    expect(zhang?.feeAmount).toBe(4000);
    expect(zhang?.netDividend).toBe(6000);
    expect(zhang?.feeRate).toBeCloseTo(0.40);

    // Verify detailed tier calculations
    const tier = zhang?.tierDetail;
    expect(tier).toBeDefined();
    expect(tier?.hurdleProfitThreshold).toBe(2500);
    expect(tier?.profitRate).toBeCloseTo(0.20);
    expect(tier?.tier1Profit).toBe(2500);
    expect(tier?.tier1Fee).toBe(250);
    expect(tier?.tier2Profit).toBe(7500);
    expect(tier?.tier2Fee).toBe(3750);
    expect(tier?.effectiveFeeRate).toBeCloseTo(0.40);
    expect(tier?.calculationSummary).toContain('5%以内部分');
    expect(tier?.calculationSummary).toContain('超出5%超额部分');
  });

  it('Rule 2: Simulates new member entry, blocking if profit <= 0 and allowing clean equal split if profit > 0', () => {
    const principals = calculateCounterpartyPrincipals(sampleItems, 2026);

    // If profit <= 0, entry is barred
    const blocked = simulateNewMemberEntry({
      currentProfit: 0,
      principals,
      newMemberName: '赵六',
      newMemberAmount: 50000,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('保证盈利之后');

    // If profit > 0, existing profit is pre-distributed and clean principal is retained
    const allowed = simulateNewMemberEntry({
      currentProfit: 1000,
      principals,
      newMemberName: '赵六',
      newMemberAmount: 50000,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.totalDividendPaidOut).toBe(900);
    expect(allowed.postEntryPool.totalCapital).toBe(150000); // 50k + 50k + 50k

    // Now 3 members each have 50,000 (1/3 each)
    const members = allowed.postEntryPool.members;
    expect(members.length).toBe(3);
    for (const m of members) {
      expect(m.capital).toBe(50000);
      expect(m.newShareRatio).toBeCloseTo(1 / 3);
    }
  });

  it('generates formatted notice texts without error', () => {
    const principals = calculateCounterpartyPrincipals(sampleItems, 2026);
    const plan = calculateAnnualDividendPlan({
      year: 2026,
      totalProfit: 1000,
      principals,
    });

    const dividendNotice = generateDividendNoticeText({
      accountAlias: 'main_zjcf_qmt',
      plan,
      settleDate: '2026-01-04',
    });
    expect(dividendNotice).toContain('main_zjcf_qmt 合伙资金收益分红结算账单');
    expect(dividendNotice).toContain('张三');
    expect(dividendNotice).toContain('¥450.00');

    const posNotice = generatePositionNoticeText({
      accountAlias: 'main_zjcf_qmt',
      date: '2026-09-06',
      totalAsset: 125000,
      positionRatio: 82.5,
      holdings: [
        { code: '600519', name: '贵州茅台', totalValue: 60000, weight: 48, profitLoss: 3200 },
        { code: '300750', name: '宁德时代', totalValue: 43000, weight: 34.4, profitLoss: -800 },
      ],
    });
    expect(posNotice).toContain('仓位分布与资产运作情况报告');
    expect(posNotice).toContain('贵州茅台');
    expect(posNotice).toContain('3日内完成制作并如期通知到位');
  });

  it('excludes January withdrawals as prior year profit distribution without reducing principal or triggering re-entry', () => {
    const itemsWithJanuaryWithdraw: CashFlowItem[] = [
      {
        id: 1,
        account_alias: 'main_zjcf_qmt',
        amount: '100000.00',
        currency: 'CNY',
        counterparty: '合伙人A',
        flow_date: '2025-06-01',
        flow_type: 'deposit',
        created_at: '2025-06-01T10:00:00',
        updated_at: '2025-06-01T10:00:00',
      },
      {
        id: 2,
        account_alias: 'main_zjcf_qmt',
        amount: '20000.00',
        currency: 'CNY',
        counterparty: '合伙人A',
        flow_date: '2026-01-05', // January dividend payout for 2025
        flow_type: 'withdraw',
        created_at: '2026-01-05T10:00:00',
        updated_at: '2026-01-05T10:00:00',
      },
      {
        id: 3,
        account_alias: 'main_zjcf_qmt',
        amount: '10000.00',
        currency: 'CNY',
        counterparty: '合伙人A',
        flow_date: '2026-03-01', // subsequent deposit in March
        flow_type: 'deposit',
        created_at: '2026-03-01T10:00:00',
        updated_at: '2026-03-01T10:00:00',
      },
    ];

    // When excludeJanuaryWithdrawals is true (default)
    const principalsDefault = calculateCounterpartyPrincipals(itemsWithJanuaryWithdraw, 2026, {
      excludeJanuaryWithdrawals: true,
    });
    const partnerA = principalsDefault.find((p) => p.rawName === '合伙人A');

    expect(partnerA).toBeDefined();
    expect(partnerA?.excludedJanuaryWithdraw).toBe(20000);
    // Net principal should be 100k + 10k = 110k, January 20k withdrawal is NOT deducted!
    expect(partnerA?.netPrincipal).toBe(110000);
    // And it must NOT be marked as re-entered after exit!
    expect(partnerA?.hasReenteredInYear).toBe(false);

    // If excludeJanuaryWithdrawals is explicitly false, it would have been subtracted
    const principalsNonExcluded = calculateCounterpartyPrincipals(itemsWithJanuaryWithdraw, 2026, {
      excludeJanuaryWithdrawals: false,
    });
    const partnerANonExcluded = principalsNonExcluded.find((p) => p.rawName === '合伙人A');
    expect(partnerANonExcluded?.netPrincipal).toBe(90000); // 100k - 20k + 10k
    expect(partnerANonExcluded?.hasReenteredInYear).toBe(true); // 20k withdraw followed by 10k deposit
  });
});
