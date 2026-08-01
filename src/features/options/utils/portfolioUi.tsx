import type { ReactNode } from 'react';
import { Activity, Shield, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { Theme } from '../../../lib/theme';
import type { OptionsPosition } from '../../../lib/services/types';

export type MoneynessTag = { label: 'ATM' | 'ITM' | 'OTM'; className: string };

export function getPositionTypeInfo2(
  positionType: string,
  optionType: string,
  positionTypeZh?: string,
  isCovered?: boolean
): { icon: ReactNode; label: string; color: string; description?: string; borderColor: string } {
  const isLong = positionType === 'buy';
  const isCall = optionType === 'call';

  if ((positionTypeZh === '备兑' || isCovered) && !isLong) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '备兑',
      color: 'bg-purple-100 text-purple-800 dark:text-purple-400 dark:bg-purple-900',
      description: '备兑',
      borderColor: 'border-l-purple-500'
    };
  }

  if (isLong && isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权买入标的',
      borderColor: 'border-l-blue-500'
    };
  }

  if (isLong && !isCall) {
    return {
      icon: <Shield className="w-3 h-3" />,
      label: '权利方',
      color: 'bg-blue-100 text-blue-800 dark:text-blue-400 dark:bg-blue-900',
      description: '有权卖出标的',
      borderColor: 'border-l-blue-500'
    };
  }

  if (!isLong && isCall) {
    return {
      icon: <Target className="w-3 h-3" />,
      label: '义务方',
      color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
      description: '有义务卖出标的',
      borderColor: 'border-l-orange-500'
    };
  }

  return {
    icon: <Target className="w-3 h-3" />,
    label: '义务方',
    color: 'bg-orange-100 text-orange-800 dark:text-orange-400 dark:bg-orange-900',
    description: '有义务买入标的',
    borderColor: 'border-l-orange-500'
  };
}

export function getStatusColorClass(theme: Theme, status: OptionsPosition['status']): string {
  switch (status) {
    case 'open':
      return theme === 'dark' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700';
    case 'closed':
      return theme === 'dark' ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-700';
    case 'expired':
      return theme === 'dark' ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-700';
    default:
      return theme === 'dark' ? 'bg-zinc-800/60 text-zinc-400' : 'bg-slate-100 text-slate-700';
  }
}

export function getTypeIcon(type: OptionsPosition['type']): ReactNode {
  switch (type) {
    case 'call':
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    case 'put':
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    case 'spread':
    case 'iron_condor':
    case 'butterfly':
      return <Target className="w-4 h-4 text-purple-500" />;
    case 'straddle':
    case 'strangle':
      return <Activity className="w-4 h-4 text-orange-500" />;
    default:
      return <Shield className="w-4 h-4 text-gray-500" />;
  }
}

export function getDaysToExpiryColor(days: number): string {
  if (days <= 7) return 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/30';
  if (days <= 30) return 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/30';
  return 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30';
}

export function getMoneynessTagForPrice(p: OptionsPosition, price: number | null): MoneynessTag | null {
  if (price == null) return null;
  const thr = 0.005;
  const diffRatio = Math.abs(price - p.strike) / Math.max(p.strike, 1);
  if (diffRatio <= thr) return { label: 'ATM', className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
  const isCall = p.type === 'call' || p.contract_type_zh === 'call';
  const isITM = isCall ? price > p.strike : price < p.strike;
  return isITM
    ? { label: 'ITM', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
    : { label: 'OTM', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
}

export function getRowHighlightClassForTag(isSelected: boolean, tag: MoneynessTag | null): string {
  if (!isSelected) return '';
  if (!tag) return 'ring-1 ring-blue-300';
  if (tag.label === 'ATM') return 'ring-1 ring-blue-400';
  if (tag.label === 'ITM') return 'ring-1 ring-green-400';
  return 'ring-1 ring-amber-400';
}

export type InferredStrategyResult = {
  nameZh: string;
  category: 'bullish' | 'bearish' | 'neutral' | 'volatility';
  confidence: number;
};

export function inferStrategyFromLegsWithSelection(
  legs: OptionsPosition[],
  selectedLegs: Record<string, number>
): InferredStrategyResult | null {
  if (!legs || legs.length === 0) return null;

  const byType = {
    call: legs.filter(l => l.type === 'call'),
    put: legs.filter(l => l.type === 'put')
  };
  const getQty = (l: OptionsPosition) => selectedLegs[l.id] || 0;
  const totalLegs = legs.reduce((acc, l) => acc + (getQty(l) > 0 ? 1 : 0), 0);
  const calls = byType.call.filter(l => getQty(l) > 0);
  const puts = byType.put.filter(l => getQty(l) > 0);

  const sortByStrikeAsc = (arr: OptionsPosition[]) => [...arr].sort((a, b) => a.strike - b.strike);

  if (totalLegs === 1) {
    const l = legs.find(x => getQty(x) > 0)!;
    if (l.type === 'call') {
      return { nameZh: l.position_type === 'buy' ? '买入看涨' : '卖出看涨', category: l.position_type === 'buy' ? 'bullish' : 'bearish', confidence: 0.9 };
    } else if (l.type === 'put') {
      return { nameZh: l.position_type === 'buy' ? '买入看跌' : '卖出看跌', category: l.position_type === 'buy' ? 'bearish' : 'bullish', confidence: 0.9 };
    }
  }

  if (calls.length === 2 && puts.length === 0) {
    const [c1, c2] = sortByStrikeAsc(calls);
    const q1 = getQty(c1), q2 = getQty(c2);
    if (q1 === q2 && q1 > 0) {
      if (c1.position_type === 'buy' && c2.position_type === 'sell') {
        return { nameZh: '牛市看涨价差', category: 'bullish', confidence: 0.95 };
      }
      if (c1.position_type === 'sell' && c2.position_type === 'buy') {
        return { nameZh: '熊市看涨价差', category: 'bearish', confidence: 0.95 };
      }
    }
  }
  if (puts.length === 2 && calls.length === 0) {
    const [p1, p2] = sortByStrikeAsc(puts);
    const q1 = getQty(p1), q2 = getQty(p2);
    if (q1 === q2 && q1 > 0) {
      if (p1.position_type === 'sell' && p2.position_type === 'buy') {
        return { nameZh: '牛市看跌价差', category: 'bullish', confidence: 0.95 };
      }
      if (p1.position_type === 'buy' && p2.position_type === 'sell') {
        return { nameZh: '熊市看跌价差', category: 'bearish', confidence: 0.95 };
      }
    }
  }

  if (calls.length === 1 && puts.length === 1) {
    const c = calls[0], p = puts[0];
    const qc = getQty(c), qp = getQty(p);
    if (qc === qp && qc > 0 && c.position_type === 'buy' && p.position_type === 'buy') {
      if (c.strike === p.strike) {
        return { nameZh: '买入跨式', category: 'volatility', confidence: 0.9 };
      } else {
        return { nameZh: '买入勒式', category: 'volatility', confidence: 0.9 };
      }
    }
  }

  if (calls.length === 2 && puts.length === 2) {
    const [c1, c2] = sortByStrikeAsc(calls);
    const [p1, p2] = sortByStrikeAsc(puts);
    const spreadCallShort = c1.position_type === 'sell' && c2.position_type === 'buy';
    const spreadPutShort = p1.position_type === 'sell' && p2.position_type === 'buy';
    const qtyOk = getQty(c1) === getQty(c2) && getQty(p1) === getQty(p2) && getQty(c1) === getQty(p1) && getQty(c1) > 0;
    if (spreadCallShort && spreadPutShort && qtyOk) {
      return { nameZh: '铁鹰（Iron Condor）', category: 'neutral', confidence: 0.9 };
    }
  }

  if (calls.length >= 3 && puts.length === 0) {
    const sorted = sortByStrikeAsc(calls);
    if (sorted.length === 3) {
      const [low, mid, high] = sorted;
      const qLow = getQty(low), qMid = getQty(mid), qHigh = getQty(high);
      const pattern = low.position_type === 'buy' && mid.position_type === 'sell' && high.position_type === 'buy' && qMid === qLow * 2 && qLow === qHigh && qLow > 0;
      if (pattern) return { nameZh: '蝶式价差（看涨）', category: 'neutral', confidence: 0.85 };
    }
  }

  return { nameZh: '自选组合', category: 'neutral', confidence: 0.5 };
}
