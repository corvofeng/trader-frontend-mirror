import React, { useState, useMemo, useCallback } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X, Copy, Check, Layers, Loader2 } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { stockService } from '../../../lib/services';
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
  isCall: boolean;
  isPut: boolean;
  strike: string | null;
}

interface ContractTickInfo {
  price?: number;
  pre_close?: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  volume?: number;
  loading: boolean;
}

const contractTickCache = new Map<string, { data: Partial<ContractTickInfo>; timestamp: number }>();

function ContractCellWithTick({
  contractInfo,
  rawText,
  isNearBottom,
  theme,
  copiedCode,
  onCopyCode,
}: {
  contractInfo: ParsedContract;
  rawText: string;
  isNearBottom: boolean;
  theme: Theme;
  copiedCode: string | null;
  onCopyCode: (code: string, e: React.MouseEvent) => void;
}) {
  const [tick, setTick] = useState<ContractTickInfo>({ loading: false });
  const [hasFetched, setHasFetched] = useState(false);

  const fetchTickPrice = useCallback(async () => {
    if (!contractInfo.code || hasFetched) return;
    setHasFetched(true);

    const cached = contractTickCache.get(contractInfo.code);
    if (cached && Date.now() - cached.timestamp < 30_000) {
      setTick({ ...cached.data, loading: false });
      return;
    }

    setTick((prev) => ({ ...prev, loading: true }));
    try {
      const res = await stockService.getCurrentPrice(contractInfo.code);
      if (res?.data) {
        const p = res.data.price || res.data.last_price;
        const tickData: Partial<ContractTickInfo> = {
          price: typeof p === 'number' && Number.isFinite(p) ? p : undefined,
          pre_close: res.data.pre_close,
          bid: res.data.bid ?? (res.data.bid_price?.[0] ?? undefined),
          ask: res.data.ask ?? (res.data.ask_price?.[0] ?? undefined),
          high: res.data.high,
          low: res.data.low,
          volume: res.data.volume,
        };
        contractTickCache.set(contractInfo.code, { data: tickData, timestamp: Date.now() });
        setTick({ ...tickData, loading: false });
      } else {
        setTick((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setTick((prev) => ({ ...prev, loading: false }));
    }
  }, [contractInfo.code, hasFetched]);

  const isCall = contractInfo.isCall;
  const isPut = contractInfo.isPut;

  const priceDiff = tick.price != null && tick.pre_close != null ? tick.price - tick.pre_close : null;
  const pricePct = priceDiff != null && tick.pre_close ? (priceDiff / tick.pre_close) * 100 : null;

  return (
    <div
      className="group/contract relative inline-block max-w-[240px]"
      onMouseEnter={fetchTickPrice}
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
        >
          {contractInfo.name}
        </span>
      </div>

      {/* Popover / Tooltip on hover with smart placement and real-time tick */}
      <div
        className={`absolute ${
          isNearBottom
            ? 'bottom-full mb-2 before:content-[\'\'] before:absolute before:-bottom-2 before:left-0 before:w-full before:h-2'
            : 'top-full mt-2 before:content-[\'\'] before:absolute before:-top-2 before:left-0 before:w-full before:h-2'
        } left-0 hidden group-hover/contract:flex flex-col z-50 w-64 p-3 bg-slate-900/95 dark:bg-zinc-950/95 text-white rounded-xl shadow-2xl border border-slate-700 dark:border-zinc-800 backdrop-blur-md pointer-events-auto`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-1.5 mb-2">
          <span className="text-xs font-bold text-zinc-100 truncate">{contractInfo.name}</span>
          {contractInfo.code && (
            <button
              type="button"
              onClick={(e) => onCopyCode(contractInfo.code!, e)}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors shrink-0"
              title="复制合约代码"
            >
              {copiedCode === contractInfo.code ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  <span className="text-green-400">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-zinc-400" />
                  <span>复制</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Real-time Tick Price Banner */}
        {contractInfo.code && (
          <div className="bg-zinc-850/90 rounded-lg p-2 mb-2 border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-zinc-400 text-[10px] block">最新实时价</span>
              {tick.loading ? (
                <div className="flex items-center gap-1 text-xs text-zinc-400 py-0.5">
                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  <span>获取价格...</span>
                </div>
              ) : tick.price != null ? (
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`font-mono text-sm font-bold ${
                      priceDiff != null
                        ? priceDiff > 0
                          ? 'text-emerald-400'
                          : priceDiff < 0
                          ? 'text-rose-400'
                          : 'text-zinc-200'
                        : 'text-zinc-200'
                    }`}
                  >
                    {tick.price.toFixed(4)}
                  </span>
                  {pricePct != null && (
                    <span
                      className={`text-[10px] font-mono font-semibold ${
                        priceDiff! > 0
                          ? 'text-emerald-400'
                          : priceDiff! < 0
                          ? 'text-rose-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {priceDiff! >= 0 ? '+' : ''}
                      {pricePct.toFixed(2)}%
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-zinc-500 font-mono">--</span>
              )}
            </div>

            {/* Bid/Ask or PreClose */}
            <div className="text-right text-[10px] font-mono text-zinc-400">
              {tick.bid != null && tick.ask != null ? (
                <div>
                  <span className="text-emerald-400/90">{tick.bid.toFixed(4)}</span>
                  <span className="text-zinc-600 mx-0.5">/</span>
                  <span className="text-rose-400/90">{tick.ask.toFixed(4)}</span>
                </div>
              ) : tick.pre_close != null ? (
                <div>昨收: {tick.pre_close.toFixed(4)}</div>
              ) : null}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-y-1.5 text-[11px] text-zinc-300">
          {contractInfo.code && (
            <div>
              <span className="text-zinc-500 block text-[9px]">代码</span>
              <span className="font-mono">{contractInfo.code}</span>
            </div>
          )}
          {contractInfo.strike && (
            <div>
              <span className="text-zinc-500 block text-[9px]">行权价</span>
              <span className="font-mono font-bold text-amber-300">{contractInfo.strike}</span>
            </div>
          )}
          <div>
            <span className="text-zinc-500 block text-[9px]">方向</span>
            <span className={isCall ? 'text-sky-400 font-medium' : isPut ? 'text-amber-400 font-medium' : ''}>
              {isCall ? '认购 (Call)' : isPut ? '认沽 (Put)' : '--'}
            </span>
          </div>
        </div>

        {/* Triangle Arrow */}
        <div
          className={`absolute ${
            isNearBottom
              ? 'top-full left-4 border-4 border-transparent border-t-slate-900 dark:border-t-zinc-950'
              : 'bottom-full left-4 border-4 border-transparent border-b-slate-900 dark:border-b-zinc-950'
          }`}
        ></div>
      </div>
    </div>
  );
}

function parseContract(text: string): ParsedContract | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.+?)\s*\(([a-zA-Z0-9_.-]+)\)$/);
  if (match) {
    const name = match[1].trim();
    const code = match[2].trim();
    const isCall = /购|call/i.test(name);
    const isPut = /沽|put/i.test(name);
    const strikeMatch = name.match(/(\d+(?:\.\d+)?)(?:购|沽)?$/) || name.match(/(?:购|沽)(?:[^\d]*)(\d+(?:\.\d+)?)/);
    return {
      name,
      code,
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

  // Find column indexes for special roles
  const typeColIndex = useMemo(() => {
    return headers.findIndex((h) => /^(类型|仓位类型|头寸类型)$/i.test(h.trim()));
  }, [headers]);

  const contractColIndexes = useMemo(() => {
    const indexes = new Set<number>();
    headers.forEach((h, idx) => {
      if (/^(合约|合约名称|最佳候选|标的合约)$/i.test(h.trim())) {
        indexes.add(idx);
      }
    });
    return indexes;
  }, [headers]);

  // Extract distinct types for quick filter pills if a "类型" column exists
  const distinctTypes = useMemo(() => {
    if (typeColIndex === -1) return [];
    const set = new Set<string>();
    rows.forEach((row) => {
      const val = row[typeColIndex]?.trim();
      if (val) set.add(val);
    });
    return Array.from(set);
  }, [rows, typeColIndex]);

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
    let result = rows;

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
  }, [rows, typeColIndex, selectedTypeFilter, filterQuery]);

  // Sort filtered rows
  const sortedRows = useMemo(() => {
    if (sortColIndex === null || !sortDirection) return filteredRows;

    return [...filteredRows].sort((a, b) => {
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
  }, [filteredRows, sortColIndex, sortDirection]);

  // Calculate quick summary metrics for numeric columns (e.g. Net, TV, 数量, 到期盈亏)
  const summaryMetrics = useMemo(() => {
    const metrics: Array<{ label: string; value: string; isPnl?: boolean }> = [];
    headers.forEach((h, colIdx) => {
      const trimmedHeader = h.trim();
      if (/^(Net|TV|TV\/Day|数量|净张数|到期盈亏|盈亏|到期合约价值|权利金影响)$/i.test(trimmedHeader)) {
        let sum = 0;
        let count = 0;
        let hasValidNum = false;
        rows.forEach((r) => {
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
  }, [headers, rows]);

  const copyCodeToClipboard = useCallback((code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`已复制合约代码: ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const copyTableAsMarkdown = useCallback(() => {
    const headerLine = `| ${headers.join(' | ')} |`;
    const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataLines = sortedRows.map((r) => `| ${r.join(' | ')} |`).join('\n');
    const md = `${headerLine}\n${sepLine}\n${dataLines}`;
    navigator.clipboard.writeText(md);
    toast.success('已复制当前表格数据 (Markdown 格式)');
  }, [headers, sortedRows]);

  // Render individual cell with rich tags, contract cards, or pnl highlights
  const renderCellContent = (cell: string, colIndex: number, rowIndex: number) => {
    const trimmed = cell.trim();
    if (!trimmed || trimmed === '-') {
      return <span className="text-zinc-400 font-mono text-xs">-</span>;
    }

    const header = headers[colIndex]?.trim() || '';

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
    if (/^(原因|行权操作|备注|候选说明)$/i.test(header) || trimmed.includes('建议平仓') || trimmed.includes('建议移仓') || trimmed.includes('止盈')) {
      const parts = trimmed.split(/(建议平仓|建议移仓|请注意止盈|止盈|强平线 \d+%|准备现金 [^/]+|性价比低)/g);
      return (
        <span className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {parts.map((part, idx) => {
            if (part === '建议平仓') {
              return (
                <span key={idx} className="font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1 py-0.2 rounded border border-rose-200/50 dark:border-rose-800/40 mx-0.5">
                  建议平仓
                </span>
              );
            }
            if (part === '建议移仓') {
              return (
                <span key={idx} className="font-semibold text-amber-600 dark:text-yellow-400 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.2 rounded border border-amber-200/50 dark:border-yellow-800/40 mx-0.5">
                  建议移仓
                </span>
              );
            }
            if (part === '请注意止盈' || part === '止盈') {
              return (
                <span key={idx} className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-200/50 dark:border-emerald-800/40 mx-0.5">
                  {part}
                </span>
              );
            }
            if (/^强平线/.test(part) || part === '性价比低') {
              return (
                <span key={idx} className="font-medium text-red-500 dark:text-red-400 mx-0.5">
                  {part}
                </span>
              );
            }
            if (/^准备现金/.test(part)) {
              return (
                <span key={idx} className="font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1 py-0.2 rounded mx-0.5">
                  {part}
                </span>
              );
            }
            return part;
          })}
        </span>
      );
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
                全部 ({rows.length})
              </button>
              {distinctTypes.map((t) => {
                const count = rows.filter((r) => r[typeColIndex]?.trim() === t).length;
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
              {headers.map((header, idx) => {
                const isSorted = sortColIndex === idx;
                const isNumeric = /^(TV|TV\/Day|阈值|M\/TV|数量|净张数|行权价|标的价格|成本价|当前价|盈亏|保证金|时间价值|实现率|K|Net|乘数|买入均价|卖出均价|测算标的价|到期内在价值|到期合约价值|权利金影响|到期盈亏)$/i.test(header.trim());
                return (
                  <th
                    key={idx}
                    scope="col"
                    onClick={() => handleSort(idx)}
                    className={`px-3 py-2.5 text-xs font-semibold select-none cursor-pointer transition-colors group/th ${
                      isSorted
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/40 dark:hover:bg-zinc-800/40'
                    } ${isNumeric ? 'text-right' : 'text-left'}`}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${isNumeric ? 'justify-end' : 'justify-start'}`}>
                      <span>{header}</span>
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
                  colSpan={headers.length}
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
                    const header = headers[cIdx]?.trim() || '';
                    const isNumeric = /^(TV|TV\/Day|阈值|M\/TV|数量|净张数|行权价|标的价格|成本价|当前价|盈亏|保证金|时间价值|实现率|K|Net|乘数|买入均价|卖出均价|测算标的价|到期内在价值|到期合约价值|权利金影响|到期盈亏)$/i.test(header);
                    return (
                      <td
                        key={cIdx}
                        className={`px-3 py-2 text-xs align-middle ${
                          isNumeric ? 'text-right font-mono' : 'text-left'
                        }`}
                      >
                        {renderCellContent(cell, cIdx, rIdx)}
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
          {sortedRows.length !== rows.length && (
            <span className="text-amber-600 dark:text-yellow-400 opacity-90">(已过滤，原 {rows.length} 条)</span>
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
