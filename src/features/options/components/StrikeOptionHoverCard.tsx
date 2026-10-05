import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Theme } from '../../../lib/theme';
import { formatCurrency } from '../../../shared/utils/format';
import type { OptionQuote } from '../../../lib/services/types';
import type { CurrencyConfig } from '../../../shared/types';
import { formatOINumber } from './OpenInterestOverlay';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

export interface StrikeOptionHoverCardPositions {
  callRight: number;
  callObligation: number;
  callCovered: number;
  putRight: number;
  putObligation: number;
  putCovered: number;
  comboCallQty: number;
  comboPutQty: number;
}

export interface StrikeOptionHoverCardProps {
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement>;
  strike: number;
  isAtm: boolean;
  underlyingPrice: number | null;
  groupExpiry: string;
  quote?: OptionQuote;
  callPrice: string;
  putPrice: string;
  callTV: number | null;
  putTV: number | null;
  callMargin: number | null | undefined;
  putMargin: number | null | undefined;
  currencyConfig: CurrencyConfig;
  theme: Theme;
  activeSide?: 'strike' | 'call' | 'put' | null;
  positions: StrikeOptionHoverCardPositions;
}

export function StrikeOptionHoverCard({
  isOpen,
  triggerRef,
  strike,
  isAtm,
  underlyingPrice,
  groupExpiry,
  quote,
  callPrice,
  putPrice,
  callTV,
  putTV,
  callMargin,
  putMargin,
  currencyConfig,
  theme,
  positions,
}: StrikeOptionHoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const calculateCoords = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const cardEl = cardRef.current;
    const cardWidth = cardEl?.offsetWidth || 380;
    const cardHeight = cardEl?.offsetHeight || 260;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left: number;
    let arrowSide: 'left' | 'right' | null = null;

    // Check whether to place to the right or left of the strike column so the strike column is NEVER covered
    const spaceRight = vw - rect.right;
    const spaceLeft = rect.left;

    if (spaceRight >= cardWidth + 24) {
      // Place on the right side of the strike cell
      left = rect.right + 14;
      arrowSide = 'left';
    } else if (spaceLeft >= cardWidth + 24) {
      // Place on the left side of the strike cell
      left = rect.left - cardWidth - 14;
      arrowSide = 'right';
    } else {
      // Fallback: dock at the bottom-right of viewport to avoid covering the center
      left = Math.max(12, vw - cardWidth - 16);
      arrowSide = null;
    }

    // Align vertically with the trigger row, clamped within viewport bounds
    let top = rect.top + rect.height / 2 - cardHeight / 2;
    const minTop = 64;
    const maxTop = Math.max(minTop, vh - cardHeight - 16);
    top = Math.max(minTop, Math.min(top, maxTop));

    // Calculate vertical arrow position pointing to trigger row center
    const triggerCenterY = rect.top + rect.height / 2;
    const arrowTop = Math.max(18, Math.min(triggerCenterY - top, cardHeight - 18));

    return { top, left, arrowSide, arrowTop };
  }, [triggerRef]);

  // Synchronously initialize coordinates so there is never an unpositioned render
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    arrowSide: 'left' | 'right' | null;
    arrowTop: number;
  } | null>(calculateCoords);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const initialCoords = calculateCoords();
    if (initialCoords) {
      setCoords(initialCoords);
    }

    const handleUpdate = () => {
      const updated = calculateCoords();
      if (updated) setCoords(updated);
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isOpen, calculateCoords]);

  if (!isOpen || !coords) return null;

  // Intrinsic values
  const callIntrinsic = underlyingPrice != null ? Math.max(0, underlyingPrice - strike) : null;
  const putIntrinsic = underlyingPrice != null ? Math.max(0, strike - underlyingPrice) : null;

  // Moneyness
  const diff = underlyingPrice != null ? strike - underlyingPrice : null;
  const diffPct = underlyingPrice != null && underlyingPrice > 0 ? ((strike - underlyingPrice) / underlyingPrice) * 100 : null;

  const moneynessTag = (() => {
    if (isAtm) {
      return { text: '平值 (ATM)', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' };
    }
    if (underlyingPrice != null) {
      if (strike < underlyingPrice) {
        return { text: 'Call 实值 / Put 虚值', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' };
      }
      return { text: 'Call 虚值 / Put 实值', color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' };
    }
    return null;
  })();

  const cardThemeClass =
    theme === 'dark'
      ? 'bg-zinc-900/95 border-zinc-700/80 text-zinc-100 shadow-[0_20px_45px_-10px_rgba(0,0,0,0.7)] backdrop-blur-md'
      : theme === 'blue'
      ? 'bg-white/98 border-blue-200/90 text-slate-800 shadow-[0_20px_45px_-10px_rgba(37,99,235,0.18)] backdrop-blur-md'
      : 'bg-white/98 border-slate-200/90 text-slate-800 shadow-[0_20px_45px_-10px_rgba(15,23,42,0.18)] backdrop-blur-md';

  const subtextClass = theme === 'dark' ? 'text-zinc-400' : 'text-slate-500';
  const panelBgClass = theme === 'dark' ? 'bg-zinc-950/50' : 'bg-slate-50/80';
  const borderDividerClass = theme === 'dark' ? 'border-zinc-800' : 'border-slate-100';

  const hasCallPositions = positions.callRight > 0 || positions.callObligation > 0 || positions.callCovered > 0 || positions.comboCallQty > 0;
  const hasPutPositions = positions.putRight > 0 || positions.putObligation > 0 || positions.putCovered > 0 || positions.comboPutQty > 0;

  const originStyle =
    coords.arrowSide === 'left'
      ? `left ${coords.arrowTop}px`
      : coords.arrowSide === 'right'
      ? `right ${coords.arrowTop}px`
      : 'center center';

  const animationClass =
    coords.arrowSide === 'left'
      ? 'animate-[strikePopoverRight_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]'
      : coords.arrowSide === 'right'
      ? 'animate-[strikePopoverLeft_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]'
      : 'animate-[popoverEnter_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]';

  const content = (
    <div
      ref={cardRef}
      role="tooltip"
      className={`fixed z-[10000] w-[380px] max-w-[calc(100vw-24px)] rounded-xl border p-3.5 text-xs select-none pointer-events-none will-change-[transform,opacity] ${animationClass} ${cardThemeClass}`}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transformOrigin: originStyle,
      }}
    >
      {/* Side Arrow Indicator */}
      {coords?.arrowSide === 'left' && (
        <div
          className={`absolute -left-[5px] w-2.5 h-2.5 rotate-45 border-l border-b ${
            theme === 'dark'
              ? 'bg-zinc-900 border-zinc-700/80'
              : theme === 'blue'
              ? 'bg-white border-blue-200/90'
              : 'bg-white border-slate-200/90'
          }`}
          style={{ top: `${coords.arrowTop}px` }}
        />
      )}
      {coords?.arrowSide === 'right' && (
        <div
          className={`absolute -right-[5px] w-2.5 h-2.5 rotate-45 border-r border-t ${
            theme === 'dark'
              ? 'bg-zinc-900 border-zinc-700/80'
              : theme === 'blue'
              ? 'bg-white border-blue-200/90'
              : 'bg-white border-slate-200/90'
          }`}
          style={{ top: `${coords.arrowTop}px` }}
        />
      )}

      {/* Header Info */}
      <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/10 gap-2">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400">
            <Target className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold font-mono text-sm leading-none">
                行权价 {strike}
              </span>
              {moneynessTag && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border leading-tight ${moneynessTag.color}`}>
                  {moneynessTag.text}
                </span>
              )}
            </div>
            <div className={`text-[10px] font-mono mt-0.5 ${subtextClass}`}>
              到期日 {groupExpiry}
            </div>
          </div>
        </div>

        {underlyingPrice != null && (
          <div className="text-right shrink-0">
            <div className="text-[11px] font-mono font-medium">
              标的 <span className="font-semibold text-amber-500 dark:text-yellow-400">{formatCurrency(underlyingPrice, currencyConfig, 4)}</span>
            </div>
            {diff != null && diffPct != null && (
              <div className={`text-[10px] font-mono ${diff > 0 ? 'text-rose-500' : diff < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                {diff > 0 ? `+${diff.toFixed(4)} (+${diffPct.toFixed(2)}%)` : diff < 0 ? `${diff.toFixed(4)} (${diffPct.toFixed(2)}%)` : '平价'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Two Column Option Details: Call vs Put */}
      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        {/* Left: Call (认购) */}
        <div className={`rounded-lg p-2.5 border ${panelBgClass} ${borderDividerClass}`}>
          <div className="flex items-center justify-between pb-1.5 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <span className="font-bold text-[11px] text-emerald-600 dark:text-emerald-400">认购 Call</span>
            </div>
            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {callPrice || '-'}
            </span>
          </div>

          <div className="space-y-1 mt-1.5 text-[11px] font-mono">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className={subtextClass}>合约代码</span>
              <span className="truncate max-w-[105px] font-medium" title={quote?.call_contract_code_full || quote?.call_contract_code}>
                {quote?.call_contract_code || quote?.call_contract_code_full || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>内在价值</span>
              <span className="font-medium">{callIntrinsic != null ? callIntrinsic.toFixed(4) : '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>时间价值</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{callTV != null ? callTV.toFixed(4) : '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>卖方保证金</span>
              <span className="font-medium">{callMargin != null ? formatCurrency(callMargin, currencyConfig, 0) : '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>量 / 持仓OI</span>
              <span className="font-medium">{formatOINumber(quote?.callVolume || 0)} / {formatOINumber(quote?.callOpenInterest || 0)}</span>
            </div>

            {/* Greeks */}
            {(quote?.callDelta != null || quote?.callImpliedVol != null) && (
              <div className="pt-1 mt-1 border-t border-black/5 dark:border-white/5 text-[10px] flex justify-between">
                <span>Δ {quote.callDelta?.toFixed(3) ?? '-'}</span>
                <span>IV {quote.callImpliedVol ? `${(quote.callImpliedVol * 100).toFixed(1)}%` : '-'}</span>
              </div>
            )}

            {/* Current Positions */}
            {hasCallPositions && (
              <div className="pt-1 mt-1 border-t border-emerald-500/20 text-[10px] flex flex-wrap gap-1">
                {positions.callRight > 0 && (
                  <span className="px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    权利 {positions.callRight}
                  </span>
                )}
                {positions.callObligation > 0 && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    义务 {positions.callObligation}
                  </span>
                )}
                {positions.callCovered > 0 && (
                  <span className="px-1 py-0.2 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    备兑 {positions.callCovered}
                  </span>
                )}
                {positions.comboCallQty > 0 && (
                  <span className="px-1 py-0.2 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400">
                    组合 {positions.comboCallQty}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Put (认沽) */}
        <div className={`rounded-lg p-2.5 border ${panelBgClass} ${borderDividerClass}`}>
          <div className="flex items-center justify-between pb-1.5 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-500" />
              <span className="font-bold text-[11px] text-rose-600 dark:text-rose-400">认沽 Put</span>
            </div>
            <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
              {putPrice || '-'}
            </span>
          </div>

          <div className="space-y-1 mt-1.5 text-[11px] font-mono">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className={subtextClass}>合约代码</span>
              <span className="truncate max-w-[105px] font-medium" title={quote?.put_contract_code_full || quote?.put_contract_code}>
                {quote?.put_contract_code || quote?.put_contract_code_full || '-'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>内在价值</span>
              <span className="font-medium">{putIntrinsic != null ? putIntrinsic.toFixed(4) : '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>时间价值</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">{putTV != null ? putTV.toFixed(4) : '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>卖方保证金</span>
              <span className="font-medium">{putMargin != null ? formatCurrency(putMargin, currencyConfig, 0) : '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className={subtextClass}>量 / 持仓OI</span>
              <span className="font-medium">{formatOINumber(quote?.putVolume || 0)} / {formatOINumber(quote?.putOpenInterest || 0)}</span>
            </div>

            {/* Greeks */}
            {(quote?.putDelta != null || quote?.putImpliedVol != null) && (
              <div className="pt-1 mt-1 border-t border-black/5 dark:border-white/5 text-[10px] flex justify-between">
                <span>Δ {quote.putDelta?.toFixed(3) ?? '-'}</span>
                <span>IV {quote.putImpliedVol ? `${(quote.putImpliedVol * 100).toFixed(1)}%` : '-'}</span>
              </div>
            )}

            {/* Current Positions */}
            {hasPutPositions && (
              <div className="pt-1 mt-1 border-t border-rose-500/20 text-[10px] flex flex-wrap gap-1">
                {positions.putRight > 0 && (
                  <span className="px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    权利 {positions.putRight}
                  </span>
                )}
                {positions.putObligation > 0 && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    义务 {positions.putObligation}
                  </span>
                )}
                {positions.putCovered > 0 && (
                  <span className="px-1 py-0.2 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    备兑 {positions.putCovered}
                  </span>
                )}
                {positions.comboPutQty > 0 && (
                  <span className="px-1 py-0.2 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400">
                    组合 {positions.comboPutQty}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
