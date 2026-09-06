import type { CashFlowItem } from '../../../lib/services/types';

export interface CounterpartyPrincipal {
  rawName: string;
  totalDeposit: number;
  totalWithdraw: number;
  excludedJanuaryWithdraw: number; // 排除的1月份分红出金 (去年的资金分配)
  netPrincipal: number; // 累计入金 - (非1月份出金)
  shareRatio: number; // 本金在活跃资金池中的占比 (0 ~ 1)
  depositCount: number;
  withdrawCount: number;
  lastFlowDate?: string;
  hasReenteredInYear: boolean; // 是否当年离场后重新加入
  reentryReason?: string;
}

export type FeeCalculationMode = 'progressive' | 'fixed_10' | 'fixed_15' | 'fixed_20' | 'cliff_50' | 'zero';

export interface FeeTierDetail {
  hurdleRate: number; // 门槛收益率 (默认 0.05 即 5%)
  hurdleProfitThreshold: number; // 5%门槛金额 = 本金 * 5%
  profitRate: number; // 个人实际毛收益率 = grossProfitShare / netPrincipal
  tier1Profit: number; // 5%以内的毛利润
  tier1Rate: number; // 0.10 (10%)
  tier1Fee: number; // tier1Profit * 10%
  tier2Profit: number; // 超出5%的超额毛利润
  tier2Rate: number; // 0.50 (50%)
  tier2Fee: number; // tier2Profit * 50%
  effectiveFeeRate: number; // 综合实际手续费率 = feeAmount / grossProfitShare
  calculationSummary: string; // 一句话计算公式
}

export interface PartnerDividendItem {
  rawName: string;
  netPrincipal: number;
  shareRatio: number;
  grossProfitShare: number; // 应得毛收益 (总盈利 * 占比)
  profitRate: number; // 个人当期毛收益率 = grossProfitShare / netPrincipal (收益占出资本金成本比例)
  feeRate: number; // 适用手续费率 (综合费率)
  feeAmount: number; // 管理人手续费扣除
  netDividend: number; // 实际到手分红 (毛收益 - 手续费)
  netDividendRate: number; // 到手净分红收益率 = netDividend / netPrincipal
  remainingPrincipal: number; // 分红后留存本金
  isReentered: boolean;
  isSpecialFeeRate: boolean;
  tierDetail?: FeeTierDetail; // 超额累进制详情
}

export interface DividendPlanResult {
  year: number;
  feeMode: FeeCalculationMode;
  totalAccountAsset: number; // 当前账户总资产金额 (持仓市值 + 可用资金)
  totalProfit: number; // 最新累计利润 = 账户总资产 - 资金池总本金
  totalProfitRate: number; // 资金池整体毛收益率 = totalProfit / totalPoolPrincipal (总收益占总成本)
  totalNetDividendRate: number; // 投资人整体净收益率 = totalNetDividend / totalPoolPrincipal
  isEligibleForDividend: boolean;
  statusMessage: string;
  totalPoolPrincipal: number; // 资金池有效总本金 (总成本基准)
  totalGrossProfit: number;
  totalManagerFee: number;
  totalNetDividend: number;
  items: PartnerDividendItem[];
}

export interface NewMemberSimulationResult {
  allowed: boolean;
  reason: string;
  currentProfit: number;
  newMemberName: string;
  newMemberAmount: number;
  existingPartnersDividend: PartnerDividendItem[];
  totalDividendPaidOut: number;
  totalFeeCollected: number;
  postEntryPool: {
    totalCapital: number;
    members: Array<{
      rawName: string;
      capital: number;
      newShareRatio: number;
      isNew: boolean;
    }>;
  };
}

/**
 * Extract active natural years present in cash flow items
 */
export function getAvailableYears(items: CashFlowItem[]): number[] {
  const years = new Set<number>();
  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  for (const item of items || []) {
    if (item.flow_date) {
      const y = parseInt(item.flow_date.slice(0, 4), 10);
      if (!isNaN(y) && y > 2000 && y < 2100) {
        years.add(y);
      }
    }
  }

  return Array.from(years).sort((a, b) => b - a);
}

/**
 * Detect if a counterparty has exited (withdrawn) and then re-entered (deposited)
 * in the same natural year.
 * Rule 4: "如果离场之后又重新加入, 当年随后的盈利部分全部收取 50%的手续费."
 */
export function detectReenteredCounterparties(
  items: CashFlowItem[],
  targetYear: number,
  options?: { excludeJanuaryWithdrawals?: boolean }
): Map<string, { reentered: boolean; reason: string }> {
  const excludeJan = options?.excludeJanuaryWithdrawals ?? true;
  const result = new Map<string, { reentered: boolean; reason: string }>();

  // Group items by counterparty
  const byCounterparty = new Map<string, CashFlowItem[]>();
  for (const item of items || []) {
    const cp = (item.counterparty || '').trim();
    if (!cp) continue;
    if (!byCounterparty.has(cp)) {
      byCounterparty.set(cp, []);
    }
    byCounterparty.get(cp)!.push(item);
  }

  for (const [cp, cpItems] of byCounterparty.entries()) {
    // Filter by target year and sort ascending by date
    const yearItems = cpItems
      .filter((it) => it.flow_date && it.flow_date.startsWith(`${targetYear}-`))
      .sort((a, b) => a.flow_date.localeCompare(b.flow_date));

    let hadWithdraw = false;
    let withdrawDate = '';
    let reentered = false;
    let reenterDate = '';

    for (const it of yearItems) {
      const amt = Math.abs(parseFloat(String(it.amount)) || 0);
      if (amt <= 0) continue;

      if (it.flow_type === 'withdraw') {
        // 1月份出金为去年的利润分红资金分配，不作为退出离场行为
        const isJanuary = it.flow_date && it.flow_date.slice(5, 7) === '01';
        if (excludeJan && isJanuary) {
          continue;
        }
        hadWithdraw = true;
        withdrawDate = it.flow_date;
      } else if (it.flow_type === 'deposit' && hadWithdraw) {
        reentered = true;
        reenterDate = it.flow_date;
        break; // found re-entry
      }
    }

    if (reentered) {
      result.set(cp, {
        reentered: true,
        reason: `${targetYear}年于 ${withdrawDate} 离场出金，后于 ${reenterDate} 重新入金加入`,
      });
    } else {
      result.set(cp, { reentered: false, reason: '' });
    }
  }

  return result;
}

/**
 * Calculate net principal and active pool shares for all counterparties
 * By default excludes January withdrawals (excludeJanuaryWithdrawals: true)
 * as they represent prior year's profit distribution.
 */
export function calculateCounterpartyPrincipals(
  items: CashFlowItem[],
  targetYear?: number,
  options?: { excludeJanuaryWithdrawals?: boolean }
): CounterpartyPrincipal[] {
  const excludeJan = options?.excludeJanuaryWithdrawals ?? true;
  const effectiveYear = targetYear || new Date().getFullYear();
  const reenterMap = detectReenteredCounterparties(items, effectiveYear, { excludeJanuaryWithdrawals: excludeJan });

  const map = new Map<string, {
    deposit: number;
    withdraw: number;
    excludedJanuaryWithdraw: number;
    depositCount: number;
    withdrawCount: number;
    lastDate?: string;
  }>();

  for (const item of items || []) {
    const name = (item.counterparty || '').trim() || '未指定对手方';
    const amt = Math.abs(parseFloat(String(item.amount)) || 0);
    if (!amt) continue;

    if (!map.has(name)) {
      map.set(name, { deposit: 0, withdraw: 0, excludedJanuaryWithdraw: 0, depositCount: 0, withdrawCount: 0 });
    }
    const rec = map.get(name)!;

    if (item.flow_type === 'deposit') {
      rec.deposit += amt;
      rec.depositCount += 1;
    } else if (item.flow_type === 'withdraw') {
      const isJanuary = item.flow_date && item.flow_date.slice(5, 7) === '01';
      if (excludeJan && isJanuary) {
        rec.excludedJanuaryWithdraw += amt;
      } else {
        rec.withdraw += amt;
      }
      rec.withdrawCount += 1;
    }

    if (item.flow_date) {
      if (!rec.lastDate || item.flow_date > rec.lastDate) {
        rec.lastDate = item.flow_date;
      }
    }
  }

  // Calculate total net principal of active partners (netPrincipal > 0)
  let totalActivePrincipal = 0;
  const list: Array<{
    rawName: string;
    deposit: number;
    withdraw: number;
    excludedJanuaryWithdraw: number;
    net: number;
    depositCount: number;
    withdrawCount: number;
    lastDate?: string;
  }> = [];

  for (const [name, rec] of map.entries()) {
    const net = rec.deposit - rec.withdraw;
    if (net > 0) {
      totalActivePrincipal += net;
    }
    list.push({
      rawName: name,
      deposit: rec.deposit,
      withdraw: rec.withdraw,
      excludedJanuaryWithdraw: rec.excludedJanuaryWithdraw,
      net,
      depositCount: rec.depositCount,
      withdrawCount: rec.withdrawCount,
      lastDate: rec.lastDate,
    });
  }

  return list
    .map((item) => {
      const reenterInfo = reenterMap.get(item.rawName);
      return {
        rawName: item.rawName,
        totalDeposit: item.deposit,
        totalWithdraw: item.withdraw,
        excludedJanuaryWithdraw: item.excludedJanuaryWithdraw,
        netPrincipal: Math.max(0, item.net),
        shareRatio: totalActivePrincipal > 0 && item.net > 0 ? item.net / totalActivePrincipal : 0,
        depositCount: item.depositCount,
        withdrawCount: item.withdrawCount,
        lastFlowDate: item.lastDate,
        hasReenteredInYear: !!reenterInfo?.reentered,
        reentryReason: reenterInfo?.reason,
      };
    })
    .sort((a, b) => b.netPrincipal - a.netPrincipal);
}

/**
 * Calculate Annual Dividend Plan according to Rules 1, 4, 5 and Progressive Tiered Fee
 * - Default: Progressive Tiered Fee (5%以内10%, 超出5%收取50%)
 * - Rule 1: No management fee, only performance fee on profit.
 * - Rule 4: Re-entered partner within the same year incurs 50% penalty on all subsequent profits.
 * - Rule 5: If annual profit <= 0, no dividend is calculated. If profit > 0, mandatory distribution.
 */
export function calculateAnnualDividendPlan(params: {
  year: number;
  totalAccountAsset?: number; // 当前账户总资产
  totalProfit?: number; // 可直接指定总利润，或由 (总资产 - 资金池总本金) 算出
  principals: CounterpartyPrincipal[];
  feeMode?: FeeCalculationMode; // 默认 'progressive' 超额累进制
  standardFeeRate?: number; // default 0.10 (10%) for fixed mode
  reentryFeeRate?: number; // default 0.50 (50%) for Rule 4
  feeRateOverrides?: Record<string, number>; // optional manual override per counterparty
}): DividendPlanResult {
  const {
    year,
    totalAccountAsset,
    totalProfit: rawProfit,
    principals,
    feeMode = 'progressive',
    standardFeeRate = 0.10,
    reentryFeeRate = 0.50,
    feeRateOverrides = {},
  } = params;

  const activePrincipals = principals.filter((p) => p.netPrincipal > 0);
  const totalPoolPrincipal = activePrincipals.reduce((sum, p) => sum + p.netPrincipal, 0);

  // 核心公式：总利润 = 当前账户总金额 - 资金池总本金
  const totalProfit = rawProfit !== undefined
    ? rawProfit
    : (totalAccountAsset !== undefined ? totalAccountAsset - totalPoolPrincipal : 0);

  const effectiveAccountAsset = totalAccountAsset !== undefined
    ? totalAccountAsset
    : (totalPoolPrincipal + totalProfit);

  if (totalProfit <= 0) {
    return {
      year,
      feeMode,
      totalAccountAsset: effectiveAccountAsset,
      totalProfit,
      totalProfitRate: totalPoolPrincipal > 0 ? totalProfit / totalPoolPrincipal : 0,
      totalNetDividendRate: 0,
      isEligibleForDividend: false,
      statusMessage: totalProfit < 0
        ? `当前累计浮动亏损 ¥${Math.abs(totalProfit).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}（收益率 ${((totalProfit / (totalPoolPrincipal || 1)) * 100).toFixed(2)}%，账户总额 ¥${effectiveAccountAsset.toLocaleString('zh-CN')} < 总本金 ¥${totalPoolPrincipal.toLocaleString('zh-CN')}）。按规则第5条：当年亏损状态时不进行结算分红，留存继续运行。`
        : `当前账户处于保本状态（资产总额 ¥${effectiveAccountAsset.toLocaleString('zh-CN')} 等于总本金），未产生超额收益，根据约定暂不计提分红。`,
      totalPoolPrincipal,
      totalGrossProfit: 0,
      totalManagerFee: 0,
      totalNetDividend: 0,
      items: activePrincipals.map((p) => {
        const hurdleThreshold = p.netPrincipal * 0.05;
        return {
          rawName: p.rawName,
          netPrincipal: p.netPrincipal,
          shareRatio: p.shareRatio,
          grossProfitShare: 0,
          profitRate: 0,
          feeRate: feeRateOverrides[p.rawName] ?? (p.hasReenteredInYear ? reentryFeeRate : standardFeeRate),
          feeAmount: 0,
          netDividend: 0,
          netDividendRate: 0,
          remainingPrincipal: p.netPrincipal,
          isReentered: p.hasReenteredInYear,
          isSpecialFeeRate: p.hasReenteredInYear,
          tierDetail: {
            hurdleRate: 0.05,
            hurdleProfitThreshold: hurdleThreshold,
            profitRate: 0,
            tier1Profit: 0,
            tier1Rate: 0.10,
            tier1Fee: 0,
            tier2Profit: 0,
            tier2Rate: 0.50,
            tier2Fee: 0,
            effectiveFeeRate: 0,
            calculationSummary: '当前无盈利，手续费为 ¥0.00',
          },
        };
      }),
    };
  }

  let totalGrossProfit = 0;
  let totalManagerFee = 0;
  let totalNetDividend = 0;

  const items: PartnerDividendItem[] = activePrincipals.map((p) => {
    const grossProfitShare = totalProfit * p.shareRatio;
    const isReentered = p.hasReenteredInYear;
    const profitRate = p.netPrincipal > 0 ? grossProfitShare / p.netPrincipal : 0;
    const hurdleThreshold = p.netPrincipal * 0.05;

    let feeRate = standardFeeRate;
    let feeAmount = 0;
    let tierDetail: FeeTierDetail | undefined;

    // Rule 4 Priority: Re-entered partner within the same year incurs 50% penalty
    if (isReentered) {
      feeRate = feeRateOverrides[p.rawName] ?? reentryFeeRate;
      feeAmount = grossProfitShare * feeRate;
      tierDetail = {
        hurdleRate: 0.05,
        hurdleProfitThreshold: hurdleThreshold,
        profitRate,
        tier1Profit: 0,
        tier1Rate: 0.10,
        tier1Fee: 0,
        tier2Profit: grossProfitShare,
        tier2Rate: feeRate,
        tier2Fee: feeAmount,
        effectiveFeeRate: feeRate,
        calculationSummary: `当年离场后重新入金，触发规则第4条惩罚条款：全额按 ${Math.round(feeRate * 100)}% 计提手续费 ¥${feeAmount.toFixed(2)}`,
      };
    } else if (feeRateOverrides[p.rawName] !== undefined) {
      // Manual custom rate override
      feeRate = feeRateOverrides[p.rawName];
      feeAmount = grossProfitShare * feeRate;
      tierDetail = {
        hurdleRate: 0.05,
        hurdleProfitThreshold: hurdleThreshold,
        profitRate,
        tier1Profit: grossProfitShare,
        tier1Rate: feeRate,
        tier1Fee: feeAmount,
        tier2Profit: 0,
        tier2Rate: 0.50,
        tier2Fee: 0,
        effectiveFeeRate: feeRate,
        calculationSummary: `手动设定自定义费率 ${Math.round(feeRate * 100)}%：毛收益 ¥${grossProfitShare.toFixed(2)} × ${Math.round(feeRate * 100)}% = ¥${feeAmount.toFixed(2)}`,
      };
    } else if (feeMode === 'progressive') {
      // DEFAULT: 超额累进制 (5%以内10%, 超过5%部分50%)
      if (grossProfitShare <= hurdleThreshold) {
        // 毛收益在5%以内
        const tier1Profit = grossProfitShare;
        const tier1Fee = tier1Profit * 0.10;
        feeAmount = tier1Fee;
        feeRate = grossProfitShare > 0 ? feeAmount / grossProfitShare : 0.10;

        tierDetail = {
          hurdleRate: 0.05,
          hurdleProfitThreshold: hurdleThreshold,
          profitRate,
          tier1Profit,
          tier1Rate: 0.10,
          tier1Fee,
          tier2Profit: 0,
          tier2Rate: 0.50,
          tier2Fee: 0,
          effectiveFeeRate: feeRate,
          calculationSummary: `个人收益率 ${(profitRate * 100).toFixed(2)}% ≤ 5% 门槛（门槛额 ¥${hurdleThreshold.toFixed(2)}），全部利润 ¥${tier1Profit.toFixed(2)} 按 10% 计提手续费 ¥${feeAmount.toFixed(2)}`,
        };
      } else {
        // 超过 5% 收益率，超额部分收取 50%
        const tier1Profit = hurdleThreshold;
        const tier1Fee = tier1Profit * 0.10;
        const tier2Profit = grossProfitShare - hurdleThreshold;
        const tier2Fee = tier2Profit * 0.50;
        feeAmount = tier1Fee + tier2Fee;
        feeRate = grossProfitShare > 0 ? feeAmount / grossProfitShare : 0.50;

        tierDetail = {
          hurdleRate: 0.05,
          hurdleProfitThreshold: hurdleThreshold,
          profitRate,
          tier1Profit,
          tier1Rate: 0.10,
          tier1Fee,
          tier2Profit,
          tier2Rate: 0.50,
          tier2Fee,
          effectiveFeeRate: feeRate,
          calculationSummary: `5%以内部分 ¥${tier1Profit.toFixed(2)} × 10% = ¥${tier1Fee.toFixed(2)}；超出5%超额部分 ¥${tier2Profit.toFixed(2)} × 50% = ¥${tier2Fee.toFixed(2)}。合计手续费 ¥${feeAmount.toFixed(2)} (综合有效费率 ${(feeRate * 100).toFixed(2)}%)`,
        };
      }
    } else if (feeMode === 'cliff_50') {
      // 全额跳档制：若收益率超过5%，全部收益按50%收；否则按10%
      if (grossProfitShare > hurdleThreshold) {
        feeRate = 0.50;
        feeAmount = grossProfitShare * 0.50;
        tierDetail = {
          hurdleRate: 0.05,
          hurdleProfitThreshold: hurdleThreshold,
          profitRate,
          tier1Profit: 0,
          tier1Rate: 0.10,
          tier1Fee: 0,
          tier2Profit: grossProfitShare,
          tier2Rate: 0.50,
          tier2Fee: feeAmount,
          effectiveFeeRate: 0.50,
          calculationSummary: `收益率 ${(profitRate * 100).toFixed(2)}% > 5%，全额按 50% 跳档计提: ¥${feeAmount.toFixed(2)}`,
        };
      } else {
        feeRate = 0.10;
        feeAmount = grossProfitShare * 0.10;
        tierDetail = {
          hurdleRate: 0.05,
          hurdleProfitThreshold: hurdleThreshold,
          profitRate,
          tier1Profit: grossProfitShare,
          tier1Rate: 0.10,
          tier1Fee: feeAmount,
          tier2Profit: 0,
          tier2Rate: 0.50,
          tier2Fee: 0,
          effectiveFeeRate: 0.10,
          calculationSummary: `收益率 ${(profitRate * 100).toFixed(2)}% ≤ 5%，按 10% 计提: ¥${feeAmount.toFixed(2)}`,
        };
      }
    } else {
      // 固定费率 (fixed_10, fixed_15, fixed_20, zero)
      let rate = standardFeeRate;
      if (feeMode === 'fixed_10') rate = 0.10;
      else if (feeMode === 'fixed_15') rate = 0.15;
      else if (feeMode === 'fixed_20') rate = 0.20;
      else if (feeMode === 'zero') rate = 0;

      feeRate = rate;
      feeAmount = grossProfitShare * feeRate;
      tierDetail = {
        hurdleRate: 0.05,
        hurdleProfitThreshold: hurdleThreshold,
        profitRate,
        tier1Profit: grossProfitShare,
        tier1Rate: feeRate,
        tier1Fee: feeAmount,
        tier2Profit: 0,
        tier2Rate: 0,
        tier2Fee: 0,
        effectiveFeeRate: feeRate,
        calculationSummary: `固定费率制：毛收益 ¥${grossProfitShare.toFixed(2)} × ${Math.round(feeRate * 100)}% = ¥${feeAmount.toFixed(2)}`,
      };
    }

    const netDividend = grossProfitShare - feeAmount;
    const netDividendRate = p.netPrincipal > 0 ? netDividend / p.netPrincipal : 0;

    totalGrossProfit += grossProfitShare;
    totalManagerFee += feeAmount;
    totalNetDividend += netDividend;

    return {
      rawName: p.rawName,
      netPrincipal: p.netPrincipal,
      shareRatio: p.shareRatio,
      grossProfitShare,
      profitRate,
      feeRate,
      feeAmount,
      netDividend,
      netDividendRate,
      remainingPrincipal: p.netPrincipal,
      isReentered,
      isSpecialFeeRate: isReentered || (feeMode === 'progressive' && (tierDetail?.tier2Profit || 0) > 0),
      tierDetail,
    };
  });

  const totalProfitRate = totalPoolPrincipal > 0 ? totalProfit / totalPoolPrincipal : 0;
  const totalNetDividendRate = totalPoolPrincipal > 0 ? totalNetDividend / totalPoolPrincipal : 0;

  return {
    year,
    feeMode,
    totalAccountAsset: effectiveAccountAsset,
    totalProfit,
    totalProfitRate,
    totalNetDividendRate,
    isEligibleForDividend: true,
    statusMessage: `盈利结算条件达成！账户总额 ¥${effectiveAccountAsset.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 超过总本金 ¥${totalPoolPrincipal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，产生超额净利润 ¥${totalProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}（资金池总收益率 ${(totalProfitRate * 100).toFixed(2)}%），按超额累进制（5%以内10%，超出50%）强制结算分红。`,
    totalPoolPrincipal,
    totalGrossProfit,
    totalManagerFee,
    totalNetDividend,
    items,
  };
}

/**
 * Simulate New Member Entry Pre-distribution according to Rule 2:
 * "仅在保证盈利之后, 才允许其他人入场, 并且会把现有的收益部分作为分红分给已经在的朋友们, 
 * 确保在有新人加入时, 各位的账单可以简单的做一次均分"
 */
export function simulateNewMemberEntry(params: {
  currentProfit: number;
  principals: CounterpartyPrincipal[];
  newMemberName: string;
  newMemberAmount: number;
  standardFeeRate?: number;
}): NewMemberSimulationResult {
  const { currentProfit, principals, newMemberName, newMemberAmount, standardFeeRate = 0.10 } = params;

  if (currentProfit <= 0) {
    return {
      allowed: false,
      reason: `按规则第2条：仅在保证盈利之后，才允许其他人入场。当前账户盈利为 ${currentProfit <= 0 ? '亏损 / 0' : currentProfit}，未满足准入条件，请在账户盈利分红后再接受新投资。`,
      currentProfit,
      newMemberName,
      newMemberAmount,
      existingPartnersDividend: [],
      totalDividendPaidOut: 0,
      totalFeeCollected: 0,
      postEntryPool: {
        totalCapital: principals.reduce((acc, p) => acc + p.netPrincipal, 0),
        members: principals.map((p) => ({
          rawName: p.rawName,
          capital: p.netPrincipal,
          newShareRatio: p.shareRatio,
          isNew: false,
        })),
      },
    };
  }

  // Calculate pre-entry dividend distribution for existing partners
  const dividendPlan = calculateAnnualDividendPlan({
    year: new Date().getFullYear(),
    totalProfit: currentProfit,
    principals,
    standardFeeRate,
  });

  // After distributing profits, existing partners retain their clean principal base
  const existingCapital = dividendPlan.totalPoolPrincipal;
  const newTotalCapital = existingCapital + Math.max(0, newMemberAmount);

  const postMembers = dividendPlan.items.map((item) => ({
    rawName: item.rawName,
    capital: item.netPrincipal,
    newShareRatio: newTotalCapital > 0 ? item.netPrincipal / newTotalCapital : 0,
    isNew: false,
  }));

  if (newMemberName.trim() && newMemberAmount > 0) {
    postMembers.push({
      rawName: newMemberName.trim(),
      capital: newMemberAmount,
      newShareRatio: newTotalCapital > 0 ? newMemberAmount / newTotalCapital : 0,
      isNew: true,
    });
  }

  return {
    allowed: true,
    reason: `盈利准入条件达成！现有盈利 ¥${currentProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 已先行清算并分配给在场合伙人，账底已归整完毕，可正式接纳新投资人入金。`,
    currentProfit,
    newMemberName,
    newMemberAmount,
    existingPartnersDividend: dividendPlan.items,
    totalDividendPaidOut: dividendPlan.totalNetDividend,
    totalFeeCollected: dividendPlan.totalManagerFee,
    postEntryPool: {
      totalCapital: newTotalCapital,
      members: postMembers,
    },
  };
}

/**
 * Generate formatted WeChat / Markdown notification text for annual dividend settlement
 */
export function generateDividendNoticeText(params: {
  accountAlias: string;
  plan: DividendPlanResult;
  settleDate: string;
  isMasked?: boolean;
  getMaskName?: (raw: string) => string;
}): string {
  const { accountAlias, plan, settleDate, isMasked = false, getMaskName } = params;
  const formatName = (raw: string) => (isMasked && getMaskName ? getMaskName(raw) : raw);

  const lines: string[] = [
    `📊 【${accountAlias} 合伙资金收益分红结算账单】`,
    `📅 结算基准日: ${settleDate}`,
    `💼 结算年度: ${plan.year} 自然年`,
    `----------------------------------------`,
    `🏦 当前账户总资产金额: ¥${plan.totalAccountAsset.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
    `💰 资金池有效总本金: ¥${plan.totalPoolPrincipal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
    `📈 本期累计结算盈利: ¥${plan.totalProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (整体收益率 ${(plan.totalProfitRate * 100).toFixed(2)}% 占总成本)`,
  ];

  if (!plan.isEligibleForDividend) {
    lines.push(`⚠️ 结算状态: 暂不分红 (${plan.statusMessage})`);
    lines.push(`📌 规则说明: 不收管理费，亏损不提成；待后续实现盈利后再行强制结算。`);
    return lines.join('\n');
  }

  lines.push(`🤝 投资人分红总额: ¥${plan.totalNetDividend.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (投资人平均净收益率 ${(plan.totalNetDividendRate * 100).toFixed(2)}%)`);
  lines.push(`🏷️ 管理人提成手续费: ¥${plan.totalManagerFee.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (不收管理费，仅收盈利提成)`);
  lines.push(`----------------------------------------`);
  lines.push(`👥 各位合伙人分红明细:`);

  plan.items.forEach((item, index) => {
    let feeTag = '';
    if (item.isReentered) {
      feeTag = ' (含当年再入场50%手续费惩罚)';
    } else if (item.tierDetail) {
      const effPct = (item.tierDetail.effectiveFeeRate * 100).toFixed(1);
      if (item.tierDetail.tier2Profit > 0) {
        feeTag = ` (超额累进: 5%以内10%, 超出50% | 综合费率 ${effPct}%)`;
      } else {
        feeTag = ` (收益率≤5%，按10%提成)`;
      }
    } else {
      feeTag = ` (提成${Math.round(item.feeRate * 100)}%)`;
    }

    lines.push(
      `${index + 1}. ${formatName(item.rawName)}: 出资 ¥${item.netPrincipal.toLocaleString('zh-CN')} (占比 ${(item.shareRatio * 100).toFixed(2)}%)`
    );
    lines.push(
      `   毛收益: ¥${item.grossProfitShare.toFixed(2)} (毛收益率 ${(item.profitRate * 100).toFixed(2)}%) | 手续费: ¥${item.feeAmount.toFixed(2)}${feeTag}`
    );
    if (item.tierDetail && item.tierDetail.tier2Profit > 0 && !item.isReentered) {
      lines.push(
        `   └─ 计算明细: 5%以内(¥${item.tierDetail.tier1Profit.toFixed(2)}×10%=¥${item.tierDetail.tier1Fee.toFixed(2)}) + 超出5%(¥${item.tierDetail.tier2Profit.toFixed(2)}×50%=¥${item.tierDetail.tier2Fee.toFixed(2)})`
      );
    }
    lines.push(`   👉 应发现金分红: ¥${item.netDividend.toFixed(2)} (到手净收益率 ${(item.netDividendRate * 100).toFixed(2)}%) | 留存本金: ¥${item.remainingPrincipal.toLocaleString('zh-CN')}`);
  });

  lines.push(`----------------------------------------`);
  lines.push(`📌 约定说明: 分红发放到位后，底仓本金维持不变，确保账目清晰透明！`);
  return lines.join('\n');
}

/**
 * Generate formatted WeChat / Markdown notification for Position Distribution (Rule 3)
 */
export function generatePositionNoticeText(params: {
  accountAlias: string;
  date: string;
  totalAsset: number;
  positionRatio: number;
  holdings: Array<{ code: string; name: string; totalValue: number; weight: number; profitLoss: number }>;
}): string {
  const { accountAlias, date, totalAsset, positionRatio, holdings } = params;

  const lines: string[] = [
    `📢 【${accountAlias} 仓位分布与资产运作情况报告】`,
    `📅 报告日期: ${date}`,
    `⚖️ 仓位总敞口比例: ${positionRatio.toFixed(2)}%`,
    `💎 账户最新总资产规模: ¥${totalAsset.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
    `----------------------------------------`,
    `📋 核心持仓与资产分布:`,
  ];

  if (holdings.length === 0) {
    lines.push(`(当前暂无股票/标的持仓，全为现金流动资产储备)`);
  } else {
    holdings.forEach((h, idx) => {
      const pnlPrefix = h.profitLoss >= 0 ? '+' : '';
      lines.push(
        `${idx + 1}. ${h.name} (${h.code}): 市值 ¥${h.totalValue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (占比 ${h.weight.toFixed(2)}% | 浮动盈亏: ${pnlPrefix}¥${h.profitLoss.toFixed(2)})`
      );
    });
  }

  lines.push(`----------------------------------------`);
  lines.push(`🛡️ 履约承诺: 根据合伙约定第3条，仓位不定期同步，应要求3日内完成制作并如期通知到位。`);
  return lines.join('\n');
}
