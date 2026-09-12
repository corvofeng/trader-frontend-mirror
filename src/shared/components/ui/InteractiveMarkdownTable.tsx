import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X, Copy, Check, Layers, Radio } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { useOptionalOptionPriceWebSocketContext } from '../../../features/options/context/OptionPriceWebSocketContext';
import toast from 'react-hot-toast';

export interface InteractiveMarkdownTableProps {
  headers: string[];
  rows: string[][];
  theme: Theme;
  caption?: string;
}

type SortDirection = 'asc' | 'desc' | null;

interface ParsedContract {
  name: string;
  code: string | null;
  contract_code_full: string | null;
  isCall: boolean;
  isPut: boolean;
  strike: string | null;
}

function parseContract(text: string): ParsedContract | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.+?)\s*\(([a-zA-Z0-9_.-]+)\)$/);
  if (match) {
    const name = match[1].trim();
    const rawCode = match[2].trim();
    const code = rawCode.split('.')[0];
    const contract_code_full = rawCode.includes('.') ? rawCode : `${rawCode}.SHO`;
    const isCall = /购|call/i.test(name);
    const isPut = /沽|put/i.test(name);
    const strikeMatch = name.match(/(\d+(?:\.\d+)?)(?:购|沽)?$/) || name.match(/(?:购|沽)(?:[^\d]*)(\d+(?:\.\d+)?)/);
    return {
      name,
      code,
      contract_code_full,
      isCall,
      isPut,
      strike: strikeMatch ? strikeMatch[1] : null,
    };
  }
  if (/^科创50[购沽]/.test(trimmed) || /^[0-9a-zA-Z\u4e00-\u9fa5]+[购沽]\d+/.test(trimmed)) {
    const isCall = /购|call/i.test(trimmed);
    const isPut = /沽|put/i.test(trimmed);
    const strikeMatch = trimmed.match(/(\d+(?:\.\d+)?)(?:购|沽)?$/) || trimmed.match(/(?:购|沽)(?:[^\d]*)(\d+(?:\.\d+)?)/);
    return {
      name: trimmed,
      code: null,
      contract_code_full: null,
      isCall,
      isPut,
      strike: strikeMatch ? strikeMatch[1] : null,
    };
  }
  return null;
}

function parseCellValueForSort(cell: string): { num: number | null; date: number | null; text: string } {
  const clean = cell.trim();
  const noEmoji = clean.replace(/^[🟢🔴⚠️✅📉📞💡\s]+/, '').trim();

  // Date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const d = new Date(clean).getTime();
    if (!isNaN(d)) return { num: null, date: d, text: clean };
  }

  // Percentage or Multiplier: 90.4%, 17.1x
  const pctMatch = noEmoji.match(/^([+-]?[\d,]+(?:\.\d+)?)\s*(%|x|X)$/);
  if (pctMatch) {
    const n = parseFloat(pctMatch[1].replace(/,/g, ''));
    if (!isNaN(n)) return { num: n, date: null, text: clean };
  }

  // Pure number or signed number like +30,528.20, -415.00, 293
  const numMatch = noEmoji.match(/^([+-]?[\d,]+(?:\.\d+)?)$/);
  if (numMatch) {
    const n = parseFloat(numMatch[1].replace(/,/g, ''));
    if (!isNaN(n)) return { num: n, date: null, text: clean };
  }

  // Type Rank for predictable ordering
  const typeRanks: Record<string, number> = {
    '义务仓': 1,
    '卖义务': 1,
    '备兑': 2,
    '权利仓': 3,
    '买权利': 3,
    '已对冲': 4,
  };
  if (typeRanks[clean] !== undefined) {
    return { num: typeRanks[clean], date: null, text: clean };
  }

  return { num: null, date: null, text: clean };
}

/**
 * Real-time Live Price Cell with animated flash on tick updates
 */
function LivePriceCell({
  contractInfo,
}: {
  contractInfo: ParsedContract | null;
}) {
  const wsContext = useOptionalOptionPriceWebSocketContext();
  const fullCode = contractInfo?.contract_code_full;
  const baseCode = contractInfo?.code;

  const wsPrice = useMemo(() => {
    if (!wsContext?.prices) return undefined;
    if (fullCode && wsContext.prices[fullCode]) return wsContext.prices[fullCode];
    if (baseCode && wsContext.prices[baseCode]) return wsContext.prices[baseCode];
    return undefined;
  }, [wsContext?.prices, fullCode, baseCode]);

  const currentPrice = wsPrice?.price ?? wsPrice?.last_price;
  const bidPrice = wsPrice?.bid ?? wsPrice?.bid_price?.[0];
  const askPrice = wsPrice?.ask ?? wsPrice?.ask_price?.[0];

  // Flash animation state on price update
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (currentPrice != null && prevPriceRef.current != null && currentPrice !== prevPriceRef.current) {
      setFlash(currentPrice > prevPriceRef.current ? 'up' : 'down');
      const timer = setTimeout(() => setFlash(null), 1200);
      prevPriceRef.current = currentPrice;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  if (!contractInfo?.code && !contractInfo?.contract_code_full) {
    return <span className="text-zinc-400 dark:text-zinc-600 font-mono text-xs">-</span>;
  }

  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      {currentPrice != null ? (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold transition-all duration-300 ${
            flash === 'up'
              ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50'
              : flash === 'down'
              ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/50'
              : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50'
          }`}
          title={
            bidPrice != null && askPrice != null
              ? `最新: ${currentPrice.toFixed(4)} | 买一: ${bidPrice.toFixed(4)} | 卖一: ${askPrice.toFixed(4)}`
              : `最新: ${currentPrice.toFixed(4)}`
          }
        >
          {currentPrice.toFixed(4)}
        </span>
      ) : (
        <span className="text-zinc-400 dark:text-zinc-500 text-[11px] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600 animate-pulse" />
          {wsContext?.isConnected ? '等待推送' : '--'}
        </span>
      )}
    </div>
  );
}

/**
 * Helper to compute theme-consistent tooltip styles (identical to ExpiryGroupCard PROFIT list)
 */
function getTooltipClasses(theme: Theme, isNearBottom: boolean) {
  const cardClass =
    theme === 'dark'
      ? 'bg-zinc-900/95 border-zinc-700/80 text-zinc-100 shadow-[0_16px_36px_-8px_rgba(0,0,0,0.6)]'
      : theme === 'blue'
      ? 'bg-white/98 border-blue-200 text-slate-800 shadow-[0_16px_36px_-8px_rgba(37,99,235,0.15)]'
      : 'bg-white/98 border-slate-200 text-slate-800 shadow-[0_16px_36px_-8px_rgba(15,23,42,0.15)]';

  const dividerClass =
    theme === 'dark' ? 'border-zinc-800/80' : theme === 'blue' ? 'border-blue-100' : 'border-slate-100';

  const subtextClass = theme === 'dark' ? 'text-zinc-300' : 'text-slate-600';

  const arrowClass = isNearBottom
    ? theme === 'dark'
      ? 'border-t-zinc-900'
      : 'border-t-white'
    : theme === 'dark'
    ? 'border-b-zinc-900'
    : 'border-b-white';

  return { cardClass, dividerClass, subtextClass, arrowClass };
}

/**
 * Portal-based Floating Popover that mounts to document.body,
 * avoiding clipping from table overflow-x-auto, overflow-hidden cards, and sticky headers/footers.
 */
interface FloatingPortalPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
  theme: Theme;
  align?: 'left' | 'right';
  className?: string;
  onMouseEnterPopover?: () => void;
  onMouseLeavePopover?: () => void;
  children: React.ReactNode;
}

function FloatingPortalPopover({
  isOpen,
  onClose,
  triggerRef,
  theme,
  align = 'left',
  className = '',
  onMouseEnterPopover,
  onMouseLeavePopover,
  children,
}: FloatingPortalPopoverProps) {
  const [mounted, setMounted] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState<{
    placement: 'top' | 'bottom';
    top?: number;
    bottom?: number;
    left: number;
    arrowLeft: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverEl = popoverRef.current;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const popoverWidth = popoverEl?.offsetWidth || (align === 'right' ? 360 : 288);
    const popoverHeight = popoverEl?.offsetHeight || 220;

    const spaceBelow = vh - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    let placement: 'top' | 'bottom' = 'bottom';
    if (spaceBelow < popoverHeight + 16 && spaceAbove > spaceBelow) {
      placement = 'top';
    }

    let top: number | undefined;
    let bottom: number | undefined;
    let maxHeight: number;

    if (placement === 'bottom') {
      top = Math.max(8, triggerRect.bottom + 8);
      maxHeight = Math.max(160, vh - top - 16);
    } else {
      bottom = Math.max(8, vh - triggerRect.top + 8);
      maxHeight = Math.max(160, triggerRect.top - 16);
    }

    let left: number;
    if (align === 'right') {
      left = triggerRect.right - popoverWidth;
    } else {
      left = triggerRect.left;
    }

    // Keep popover horizontally within screen margins
    const margin = 12;
    const minLeft = margin;
    const maxLeft = Math.max(minLeft, vw - popoverWidth - margin);
    left = Math.max(minLeft, Math.min(left, maxLeft));

    // Calculate arrow horizontal center relative to popover box
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const arrowLeft = Math.max(16, Math.min(triggerCenter - left, popoverWidth - 16));

    setPosition({
      placement,
      top,
      bottom,
      left,
      arrowLeft,
      maxHeight,
    });
  }, [triggerRef, align]);

  // Update position on open, scroll, resize, and after DOM paint
  useEffect(() => {
    if (!isOpen || !mounted) return;
    updatePosition();
    const rafId = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, mounted, updatePosition]);

  useEffect(() => {
    if (!isOpen || !mounted) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, mounted, updatePosition]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen || !mounted) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, mounted, onClose, triggerRef]);

  if (!mounted || !isOpen || typeof document === 'undefined') {
    return null;
  }

  const { cardClass, arrowClass } = getTooltipClasses(theme, position?.placement === 'top');

  return createPortal(
    <div
      ref={popoverRef}
      onMouseEnter={onMouseEnterPopover}
      onMouseLeave={onMouseLeavePopover}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: position?.top !== undefined ? `${position.top}px` : undefined,
        bottom: position?.bottom !== undefined ? `${position.bottom}px` : undefined,
        left: position?.left !== undefined ? `${position.left}px` : '-9999px',
        zIndex: 9999,
      }}
      className={`fixed ${cardClass} border rounded-xl pointer-events-auto shadow-2xl backdrop-blur-xl ${className}`}
    >
      <div
        style={{
          maxHeight: position?.maxHeight ? `${position.maxHeight}px` : undefined,
        }}
        className="p-3.5 overflow-y-auto overscroll-contain custom-scrollbar"
      >
        {children}
      </div>

      {/* Triangle Arrow */}
      {position && (
        <div
          style={{ left: `${position.arrowLeft}px` }}
          className={`absolute pointer-events-none -translate-x-1/2 ${
            position.placement === 'top'
              ? 'top-full border-t-[6px] border-x-[6px] border-b-0'
              : 'bottom-full border-b-[6px] border-x-[6px] border-t-0'
          } border-x-transparent ${arrowClass}`}
        />
      )}
    </div>,
    document.body
  );
}

/**
 * Contract Name Cell with popover and inline candidate tick price
 */
function ContractCellWithTick({
  contractInfo,
  rawText,
  theme,
  copiedCode,
  onCopyCode,
}: {
  contractInfo: ParsedContract;
  rawText: string;
  isNearBottom?: boolean;
  theme: Theme;
  copiedCode: string | null;
  onCopyCode: (code: string, e: React.MouseEvent) => void;
}) {
  const wsContext = useOptionalOptionPriceWebSocketContext();
  const fullCode = contractInfo.contract_code_full;
  const baseCode = contractInfo.code;

  const triggerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsPrice = useMemo(() => {
    if (!wsContext?.prices) return undefined;
    if (fullCode && wsContext.prices[fullCode]) return wsContext.prices[fullCode];
    if (baseCode && wsContext.prices[baseCode]) return wsContext.prices[baseCode];
    return undefined;
  }, [wsContext?.prices, fullCode, baseCode]);

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (wsContext?.queryPrice) {
      const codeToQuery = fullCode || baseCode;
      if (codeToQuery) {
        wsContext.queryPrice([codeToQuery]);
      }
    }
    setIsOpen(true);
  }, [fullCode, baseCode, wsContext]);

  const handleMouseLeave = useCallback(() => {
    if (isPinned) return;
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  }, [isPinned]);

  const handlePopoverMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    if (isPinned) return;
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  }, [isPinned]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinned((prev) => !prev);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsPinned(false);
  }, []);

  const isCall = contractInfo.isCall;
  const isPut = contractInfo.isPut;

  const currentPrice = wsPrice?.price ?? wsPrice?.last_price;
  const bidPrice = wsPrice?.bid ?? wsPrice?.bid_price?.[0];
  const askPrice = wsPrice?.ask ?? wsPrice?.ask_price?.[0];
  const displayCode = contractInfo.contract_code_full || contractInfo.code;

  const { dividerClass, subtextClass } = getTooltipClasses(theme, false);

  return (
    <div
      ref={triggerRef}
      className="group/contract relative inline-block max-w-[240px]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1.5 cursor-pointer">
        <span
          className={`font-medium text-xs truncate hover:underline ${
            isCall
              ? 'text-sky-700 dark:text-sky-300'
              : isPut
              ? 'text-amber-700 dark:text-amber-300'
              : themes[theme].text
          }`}
          title={rawText}
          data-contract-code={displayCode || undefined}
        >
          {contractInfo.name}
        </span>
      </div>

      <FloatingPortalPopover
        isOpen={isOpen}
        onClose={handleClose}
        triggerRef={triggerRef}
        theme={theme}
        align="left"
        className="w-72"
        onMouseEnterPopover={handlePopoverMouseEnter}
        onMouseLeavePopover={handlePopoverMouseLeave}
      >
        <div className={`flex items-center justify-between gap-2 border-b ${dividerClass} pb-1.5 mb-2`}>
          <span className="text-xs font-bold truncate">{contractInfo.name}</span>
          <div className="flex items-center gap-1.5">
            {displayCode && (
              <button
                type="button"
                onClick={(e) => onCopyCode(displayCode, e)}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors shrink-0 font-medium"
                title="复制合约代码"
              >
                {copiedCode === displayCode ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-500">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 opacity-60" />
                    <span>复制</span>
                  </>
                )}
              </button>
            )}
            {isPinned && (
              <button
                type="button"
                onClick={handleClose}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                title="关闭"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Real-time WebSocket Tick Price Banner */}
        {displayCode && (
          <div className={`rounded-lg p-2 mb-2 border ${dividerClass} ${theme === 'dark' ? 'bg-zinc-800/60' : 'bg-slate-50'} flex items-center justify-between`}>
            <div>
              <div className="flex items-center gap-1 opacity-75 text-[10px] mb-0.5">
                <Radio className={`w-2.5 h-2.5 ${wsContext?.isConnected ? 'text-emerald-500 animate-pulse' : 'opacity-50'}`} />
                <span>实时行情</span>
              </div>
              {currentPrice != null ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {currentPrice.toFixed(4)}
                  </span>
                </div>
              ) : (
                <span className="text-xs opacity-60 font-mono">
                  {wsContext?.isConnected ? '等待推送...' : '--'}
                </span>
              )}
            </div>

            {/* Bid/Ask Spread */}
            <div className="text-right text-[10px] font-mono opacity-80">
              {bidPrice != null && askPrice != null ? (
                <div>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{bidPrice.toFixed(4)}</span>
                  <span className="opacity-40 mx-0.5">/</span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">{askPrice.toFixed(4)}</span>
                </div>
              ) : (
                <div className="text-[9px] opacity-60">买一 / 卖一</div>
              )}
            </div>
          </div>
        )}

        <div className={`grid grid-cols-2 gap-y-1.5 text-[11px] ${subtextClass}`}>
          {displayCode && (
            <div>
              <span className="opacity-60 block text-[9px]">代码</span>
              <span className="font-mono text-[10px] font-medium">{displayCode}</span>
            </div>
          )}
          {contractInfo.strike && (
            <div>
              <span className="opacity-60 block text-[9px]">行权价</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-300">{contractInfo.strike}</span>
            </div>
          )}
          <div>
            <span className="opacity-60 block text-[9px]">方向</span>
            <span className={isCall ? 'text-sky-600 dark:text-sky-400 font-medium' : isPut ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
              {isCall ? '认购 (Call)' : isPut ? '认沽 (Put)' : '--'}
            </span>
          </div>
        </div>
      </FloatingPortalPopover>
    </div>
  );
}

interface ReasonTag {
  type: 'close' | 'roll' | 'profit' | 'low_val' | 'margin' | 'cash' | 'custom';
  label: string;
  className: string;
}

function extractReasonTags(text: string): ReasonTag[] {
  const tags: ReasonTag[] = [];
  const trimmed = text.trim();

  if (trimmed.includes('建议平仓')) {
    tags.push({
      type: 'close',
      label: '建议平仓',
      className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200/70 dark:border-rose-800/60',
    });
  }
  if (trimmed.includes('建议移仓')) {
    tags.push({
      type: 'roll',
      label: '建议移仓',
      className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-yellow-300 border-amber-200/70 dark:border-yellow-800/60',
    });
  }
  if (trimmed.includes('请注意止盈') || trimmed.includes('止盈')) {
    tags.push({
      type: 'profit',
      label: trimmed.includes('请注意止盈') ? '请注意止盈' : '止盈',
      className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/60',
    });
  }
  if (trimmed.includes('性价比低')) {
    tags.push({
      type: 'low_val',
      label: '性价比低',
      className: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 border-orange-200/70 dark:border-orange-800/60',
    });
  }
  const marginMatch = trimmed.match(/强平线\s*\d+%/);
  if (marginMatch) {
    tags.push({
      type: 'margin',
      label: marginMatch[0],
      className: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-200/70 dark:border-red-800/60',
    });
  }
  const cashMatch = trimmed.match(/准备现金\s*[^/；;,，]+/);
  if (cashMatch) {
    tags.push({
      type: 'cash',
      label: cashMatch[0].trim(),
      className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200/70 dark:border-blue-800/60',
    });
  }

  // If no predefined action keyword was matched, fallback to a concise custom pill
  if (tags.length === 0 && trimmed && trimmed !== '-') {
    const shortLabel = trimmed.length > 10 ? `${trimmed.slice(0, 10)}...` : trimmed;
    tags.push({
      type: 'custom',
      label: shortLabel,
      className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
    });
  }

  return tags;
}

/**
 * Compact Reason Cell displaying tags, showing full detailed advice on hover/click popover via Portal.
 * Never blocked by table top/bottom bars or container overflow.
 */
function ReasonCellWithPopover({
  rawText,
  theme,
}: {
  rawText: string;
  isNearBottom?: boolean;
  theme: Theme;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tags = useMemo(() => extractReasonTags(rawText), [rawText]);
  const clauses = useMemo(
    () => rawText.split(/[；;]/).map((s) => s.trim()).filter(Boolean),
    [rawText]
  );

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isPinned) return;
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  }, [isPinned]);

  const handlePopoverMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    if (isPinned) return;
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  }, [isPinned]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinned((prev) => !prev);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsPinned(false);
  }, []);

  const { dividerClass, subtextClass } = getTooltipClasses(theme, false);

  return (
    <div
      ref={triggerRef}
      className="group/reason relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Visible Tag Chips */}
      <div className="flex items-center gap-1.5 flex-wrap cursor-pointer select-none">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border shadow-2xs transition-all hover:scale-105 ${tag.className}`}
          >
            {tag.label}
          </span>
        ))}
      </div>

      <FloatingPortalPopover
        isOpen={isOpen}
        onClose={handleClose}
        triggerRef={triggerRef}
        theme={theme}
        align="right"
        className="w-max min-w-[240px] max-w-sm sm:max-w-md text-left"
        onMouseEnterPopover={handlePopoverMouseEnter}
        onMouseLeavePopover={handlePopoverMouseLeave}
      >
        <div className={`text-[11px] font-bold text-amber-600 dark:text-yellow-400 mb-2 flex items-center justify-between border-b ${dividerClass} pb-1.5`}>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>详细原因与建议</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-normal font-mono opacity-60">触发规则</span>
            {isPinned && (
              <button
                type="button"
                onClick={handleClose}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                title="关闭"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className={`space-y-1.5 text-xs leading-relaxed ${subtextClass} whitespace-normal break-words`}>
          {clauses.map((clause, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-amber-500 font-bold text-xs shrink-0 mt-0.5">•</span>
              <span className="break-words font-medium">{clause}</span>
            </div>
          ))}
        </div>
      </FloatingPortalPopover>
    </div>
  );
}

export function InteractiveMarkdownTable({
  headers,
  rows,
  theme,
  caption,
}: InteractiveMarkdownTableProps) {
  const [sortColIndex, setSortColIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const wsContext = useOptionalOptionPriceWebSocketContext();

  // Find column indexes for special roles
  const rawPrimaryContractColIdx = useMemo(() => {
    return headers.findIndex((h) => /^(合约|标的合约|合约名称)$/i.test(h.trim()));
  }, [headers]);

  const hasExplicitLivePriceCol = useMemo(() => {
    return headers.some((h) => /^(实时价|最新价|现价|当前价|最新行情)$/i.test(h.trim()));
  }, [headers]);

  // Insert "实时价" column right after primary contract column if table has contract and doesn't already have live price
  const shouldInjectLivePriceCol = rawPrimaryContractColIdx !== -1 && !hasExplicitLivePriceCol;
  const livePriceColIdx = shouldInjectLivePriceCol ? rawPrimaryContractColIdx + 1 : -1;

  const displayHeaders = useMemo(() => {
    if (!shouldInjectLivePriceCol) return headers;
    const next = [...headers];
    next.splice(livePriceColIdx, 0, '实时价');
    return next;
  }, [headers, shouldInjectLivePriceCol, livePriceColIdx]);

  const displayRows = useMemo(() => {
    if (!shouldInjectLivePriceCol) return rows;
    return rows.map((r) => {
      const next = [...r];
      next.splice(livePriceColIdx, 0, '__LIVE_PRICE__');
      return next;
    });
  }, [rows, shouldInjectLivePriceCol, livePriceColIdx]);

  // Extract all contract codes present in this table (unified to full code with suffix)
  const allContractCodes = useMemo(() => {
    const codes = new Set<string>();
    rows.forEach((r) => {
      r.forEach((cell) => {
        const parsed = parseContract(cell);
        const codeToSubscribe = parsed?.contract_code_full || parsed?.code;
        if (codeToSubscribe) codes.add(codeToSubscribe);
      });
    });
    return Array.from(codes);
  }, [rows]);

  // Subscribe to all contract codes via WebSocket
  useEffect(() => {
    if (allContractCodes.length > 0 && wsContext?.queryPrice) {
      wsContext.queryPrice(allContractCodes);
    }
  }, [allContractCodes, wsContext]);

  // Column index for type filtering
  const typeColIndex = useMemo(() => {
    return displayHeaders.findIndex((h) => /^(类型|仓位类型|头寸类型)$/i.test(h.trim()));
  }, [displayHeaders]);

  const contractColIndexes = useMemo(() => {
    const indexes = new Set<number>();
    displayHeaders.forEach((h, idx) => {
      if (/^(合约|合约名称|最佳候选|标的合约)$/i.test(h.trim())) {
        indexes.add(idx);
      }
    });
    return indexes;
  }, [displayHeaders]);

  // Extract distinct types for quick filter pills if a "类型" column exists
  const distinctTypes = useMemo(() => {
    if (typeColIndex === -1) return [];
    const set = new Set<string>();
    displayRows.forEach((row) => {
      const val = row[typeColIndex]?.trim();
      if (val && val !== '-') set.add(val);
    });
    return Array.from(set);
  }, [displayRows, typeColIndex]);

  // Handle sort toggling
  const handleSort = (colIndex: number) => {
    if (sortColIndex !== colIndex) {
      setSortColIndex(colIndex);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else if (sortDirection === 'desc') {
      setSortColIndex(null);
      setSortDirection(null);
    } else {
      setSortDirection('asc');
    }
  };

  // Filter rows
  const filteredRows = useMemo(() => {
    let result = displayRows;

    if (typeColIndex !== -1 && selectedTypeFilter !== 'ALL') {
      result = result.filter((row) => row[typeColIndex]?.trim() === selectedTypeFilter);
    }

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase().trim();
      result = result.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(q))
      );
    }

    return result;
  }, [displayRows, typeColIndex, selectedTypeFilter, filterQuery]);

  // Sort filtered rows
  const sortedRows = useMemo(() => {
    if (sortColIndex === null || !sortDirection) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      // Special sort for live price column
      if (sortColIndex === livePriceColIdx) {
        const getRowPrice = (row: string[]) => {
          const rawContract = row[rawPrimaryContractColIdx] ?? '';
          const parsed = parseContract(rawContract);
          if (!parsed || !wsContext?.prices) return -Infinity;
          const p =
            (parsed.contract_code_full ? wsContext.prices[parsed.contract_code_full] : undefined) ??
            (parsed.code ? wsContext.prices[parsed.code] : undefined);
          return p?.price ?? p?.last_price ?? -Infinity;
        };
        const priceA = getRowPrice(a);
        const priceB = getRowPrice(b);
        const cmp = priceA - priceB;
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      const cellA = a[sortColIndex] ?? '';
      const cellB = b[sortColIndex] ?? '';
      const parsedA = parseCellValueForSort(cellA);
      const parsedB = parseCellValueForSort(cellB);

      let cmp = 0;
      if (parsedA.num !== null && parsedB.num !== null) {
        cmp = parsedA.num - parsedB.num;
      } else if (parsedA.date !== null && parsedB.date !== null) {
        cmp = parsedA.date - parsedB.date;
      } else {
        cmp = parsedA.text.localeCompare(parsedB.text, 'zh-CN', { numeric: true });
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredRows, sortColIndex, sortDirection, livePriceColIdx, rawPrimaryContractColIdx, wsContext?.prices]);

  // Calculate quick summary metrics for numeric columns (e.g. Net, TV, 数量, 到期盈亏)
  const summaryMetrics = useMemo(() => {
    const metrics: Array<{ label: string; value: string; isPnl?: boolean }> = [];
    displayHeaders.forEach((h, colIdx) => {
      const trimmedHeader = h.trim();
      if (/^(Net|TV|TV\/Day|数量|净张数|到期盈亏|盈亏|到期合约价值|权利金影响)$/i.test(trimmedHeader)) {
        let sum = 0;
        let count = 0;
        let hasValidNum = false;
        displayRows.forEach((r) => {
          const parsed = parseCellValueForSort(r[colIdx] ?? '');
          if (parsed.num !== null) {
            sum += parsed.num;
            count += 1;
            hasValidNum = true;
          }
        });
        if (hasValidNum && count > 0) {
          const isPnl = /^(Net|到期盈亏|盈亏|权利金影响)$/i.test(trimmedHeader);
          let formattedValue = '';
          if (trimmedHeader === 'TV/Day') {
            formattedValue = (sum / count).toFixed(2);
            metrics.push({ label: `平均 ${trimmedHeader}`, value: formattedValue });
          } else {
            formattedValue = sum.toLocaleString(undefined, {
              minimumFractionDigits: sum % 1 !== 0 ? 2 : 0,
              maximumFractionDigits: 2,
            });
            if (isPnl && sum > 0) formattedValue = `+${formattedValue}`;
            metrics.push({ label: `合计 ${trimmedHeader}`, value: formattedValue, isPnl });
          }
        }
      }
    });
    return metrics;
  }, [displayHeaders, displayRows]);

  const copyCodeToClipboard = useCallback((code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`已复制合约代码: ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const copyTableAsMarkdown = useCallback(() => {
    const headerLine = `| ${displayHeaders.join(' | ')} |`;
    const sepLine = `| ${displayHeaders.map(() => '---').join(' | ')} |`;
    const dataLines = sortedRows.map((r) => {
      const formattedCells = r.map((c, idx) => {
        if (c === '__LIVE_PRICE__' || displayHeaders[idx] === '实时价') {
          const rawContract = r[rawPrimaryContractColIdx] ?? '';
          const parsed = parseContract(rawContract);
          if (!parsed || !wsContext?.prices) return '-';
          const p =
            (parsed.contract_code_full ? wsContext.prices[parsed.contract_code_full] : undefined) ??
            (parsed.code ? wsContext.prices[parsed.code] : undefined);
          const num = p?.price ?? p?.last_price;
          return num != null ? num.toFixed(4) : '-';
        }
        return c;
      });
      return `| ${formattedCells.join(' | ')} |`;
    }).join('\n');
    const md = `${headerLine}\n${sepLine}\n${dataLines}`;
    navigator.clipboard.writeText(md);
    toast.success('已复制当前表格数据 (含实时行情, Markdown 格式)');
  }, [displayHeaders, sortedRows, rawPrimaryContractColIdx, wsContext?.prices]);

  // Render individual cell with rich tags, contract cards, or pnl highlights
  const renderCellContent = (cell: string, colIndex: number, rowIndex: number, row: string[]) => {
    const trimmed = cell.trim();

    // 0. Injected Live Price Column
    if (cell === '__LIVE_PRICE__' || displayHeaders[colIndex] === '实时价') {
      const rawContract = row[rawPrimaryContractColIdx] ?? '';
      const parsed = parseContract(rawContract);
      return <LivePriceCell contractInfo={parsed} />;
    }

    if (!trimmed || trimmed === '-') {
      return <span className="text-zinc-400 font-mono text-xs">-</span>;
    }

    const header = displayHeaders[colIndex]?.trim() || '';

    // 1. Position / Option Type Badges
    if (colIndex === typeColIndex || /^(类型|仓位类型|头寸类型)$/i.test(header) || ['义务仓', '权利仓', '备兑', '已对冲', '卖义务', '买权利'].includes(trimmed)) {
      if (trimmed === '义务仓' || trimmed === '卖义务') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 shadow-2xs">
            {trimmed}
          </span>
        );
      }
      if (trimmed === '备兑') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 shadow-2xs">
            {trimmed}
          </span>
        );
      }
      if (trimmed === '权利仓' || trimmed === '买权利') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 shadow-2xs">
            {trimmed}
          </span>
        );
      }
      if (trimmed === '已对冲') {
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
            {trimmed}
          </span>
        );
      }
    }

    // 2. Call / Put Type tags
    if (trimmed === '认购' || trimmed === 'Call') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50">
          认购
        </span>
      );
    }
    if (trimmed === '认沽' || trimmed === 'Put') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
          认沽
        </span>
      );
    }

    // 3. Status Badges (YES / NO / 实值 / 虚值 / 平值)
    if (trimmed === 'YES') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
          YES
        </span>
      );
    }
    if (trimmed === 'NO') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-normal bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
          NO
        </span>
      );
    }
    if (trimmed === '实值') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
          实值
        </span>
      );
    }
    if (trimmed === '虚值') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-normal bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
          虚值
        </span>
      );
    }

    // 4. Contract Cell formatting (with smart upward/downward popover and real-time tick price)
    const contractInfo = parseContract(trimmed);
    if (contractInfo && (contractColIndexes.has(colIndex) || contractInfo.code)) {
      const totalRows = sortedRows.length;
      const isNearBottom = totalRows <= 3 ? rowIndex > 0 : rowIndex >= totalRows - 3 || rowIndex >= Math.floor(totalRows / 2);
      return (
        <ContractCellWithTick
          contractInfo={contractInfo}
          rawText={trimmed}
          isNearBottom={isNearBottom}
          theme={theme}
          copiedCode={copiedCode}
          onCopyCode={copyCodeToClipboard}
        />
      );
    }

    // 5. PnL / Monetary / Net coloring
    const isPnlCol = /^(Net|盈亏|到期盈亏|权利金影响|到期合约价值)$/i.test(header);
    const noEmoji = trimmed.replace(/^[🟢🔴⚠️✅📉📞💡\s]+/, '').trim();
    const isPositive = /^\+/.test(noEmoji) || trimmed.startsWith('🟢');
    const isNegative = /^-/.test(noEmoji) || trimmed.startsWith('🔴');

    if (isPnlCol || isPositive || isNegative) {
      if (isPositive) {
        return (
          <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {trimmed}
          </span>
        );
      }
      if (isNegative) {
        return (
          <span className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">
            {trimmed}
          </span>
        );
      }
    }

    // 6. Numeric values (Monospace)
    const isNumericHeader = /^(TV|TV\/Day|阈值|M\/TV|数量|净张数|行权价|标的价格|成本价|当前价|保证金|时间价值|实现率|K|乘数|买入均价|卖出均价|测算标的价|到期内在价值)$/i.test(header);
    if (isNumericHeader || /^[\d,.]+(%|x|元|元\/天)?$/.test(trimmed)) {
      return <span className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-200">{trimmed}</span>;
    }

    // 7. Reasons / Action Advice with highlighted keywords
    const isReasonCol = /^(原因|行权操作|备注|候选说明|说明|描述)$/i.test(header);
    if (isReasonCol || trimmed.includes('建议平仓') || trimmed.includes('建议移仓') || trimmed.includes('止盈') || trimmed.includes('强平线') || trimmed.includes('性价比低')) {
      const totalRows = sortedRows.length;
      const isNearBottom = totalRows <= 3 ? rowIndex > 0 : rowIndex >= totalRows - 3 || rowIndex >= Math.floor(totalRows / 2);
      return <ReasonCellWithPopover rawText={trimmed} isNearBottom={isNearBottom} theme={theme} />;
    }

    return <span className="text-xs text-zinc-700 dark:text-zinc-200">{trimmed}</span>;
  };

  return (
    <div className="my-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 shadow-xs backdrop-blur-sm overflow-hidden transition-all">
      {/* Table Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 bg-slate-50/80 dark:bg-zinc-800/40 border-b border-slate-200/80 dark:border-zinc-800/80 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          {caption && (
            <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              {caption}
            </span>
          )}

          {/* Type Quick Filter Pills */}
          {distinctTypes.length > 1 && (
            <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 rounded-lg p-0.5 border border-slate-200 dark:border-zinc-700/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedTypeFilter('ALL')}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-all font-medium ${
                  selectedTypeFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                全部 ({displayRows.length})
              </button>
              {distinctTypes.map((t) => {
                const count = displayRows.filter((r) => r[typeColIndex]?.trim() === t).length;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTypeFilter(t)}
                    className={`px-2 py-0.5 rounded-md text-[11px] transition-all font-medium ${
                      selectedTypeFilter === t
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {t} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right tools: Search & Copy */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Quick Search */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索表格..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-7 pr-6 py-1 bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-700/70 rounded-md text-[11px] text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-28 sm:w-36 transition-all"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="absolute right-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Reset Sort/Filter Button */}
          {(sortColIndex !== null || selectedTypeFilter !== 'ALL' || filterQuery) && (
            <button
              type="button"
              onClick={() => {
                setSortColIndex(null);
                setSortDirection(null);
                setSelectedTypeFilter('ALL');
                setFilterQuery('');
              }}
              className="px-2 py-1 text-[11px] rounded-md text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800 transition-colors"
            >
              重置
            </button>
          )}

          {/* Copy Table */}
          <button
            type="button"
            onClick={copyTableAsMarkdown}
            className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800 transition-colors"
            title="复制表格 (Markdown 格式)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Table Scroll Area */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-zinc-800 text-left border-collapse">
          <thead>
            <tr className="bg-slate-100/70 dark:bg-zinc-850/70">
              {displayHeaders.map((header, idx) => {
                const isSorted = sortColIndex === idx;
                const isNumeric = /^(TV|TV\/Day|阈值|M\/TV|数量|净张数|行权价|标的价格|成本价|当前价|盈亏|保证金|时间价值|实现率|K|Net|乘数|买入均价|卖出均价|测算标的价|到期内在价值|到期合约价值|权利金影响|到期盈亏|实时价)$/i.test(header.trim());
                return (
                  <th
                    key={idx}
                    scope="col"
                    onClick={() => handleSort(idx)}
                    className={`px-3 py-2.5 text-xs font-semibold select-none cursor-pointer transition-colors group/th whitespace-nowrap ${
                      isSorted
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/40 dark:hover:bg-zinc-800/40'
                    } ${isNumeric ? 'text-right' : 'text-left'}`}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${isNumeric ? 'justify-end' : 'justify-start'}`}>
                      <span>
                        {header === '实时价' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                            <Radio className="w-3 h-3 animate-pulse" />
                            实时价
                          </span>
                        ) : (
                          header
                        )}
                      </span>
                      <span className="shrink-0 opacity-60 group-hover/th:opacity-100">
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30 group-hover/th:opacity-80" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 dark:divide-zinc-800/60 bg-white dark:bg-zinc-900/40">
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={displayHeaders.length}
                  className="px-4 py-8 text-center text-xs text-slate-400 dark:text-zinc-500"
                >
                  无匹配数据
                </td>
              </tr>
            ) : (
              sortedRows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="relative hover:z-30 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors odd:bg-slate-50/30 dark:odd:bg-zinc-900/20"
                >
                  {row.map((cell, cIdx) => {
                    const header = displayHeaders[cIdx]?.trim() || '';
                    const isNumeric = /^(TV|TV\/Day|阈值|M\/TV|数量|净张数|行权价|标的价格|成本价|当前价|盈亏|保证金|时间价值|实现率|K|Net|乘数|买入均价|卖出均价|测算标的价|到期内在价值|到期合约价值|权利金影响|到期盈亏|实时价)$/i.test(header);
                    return (
                      <td
                        key={cIdx}
                        className={`px-3 py-2 text-xs align-middle whitespace-nowrap ${
                          isNumeric ? 'text-right font-mono' : 'text-left'
                        }`}
                      >
                        {renderCellContent(cell, cIdx, rIdx, row)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Footer Bar (if metrics exist or rows > 0) */}
      <div className="px-3.5 py-2 bg-slate-50/90 dark:bg-zinc-850/60 border-t border-slate-200/80 dark:border-zinc-800/80 text-[11px] text-slate-500 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <span>共 {sortedRows.length} 条记录</span>
          {sortedRows.length !== displayRows.length && (
            <span className="text-amber-600 dark:text-yellow-400 opacity-90">(已过滤，原 {displayRows.length} 条)</span>
          )}
        </div>

        {summaryMetrics.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-auto">
            {summaryMetrics.map((m, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="opacity-75">{m.label}:</span>
                <span
                  className={`font-mono font-semibold ${
                    m.isPnl
                      ? m.value.startsWith('+')
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : m.value.startsWith('-')
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-800 dark:text-zinc-200'
                      : 'text-slate-800 dark:text-zinc-200'
                  }`}
                >
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
