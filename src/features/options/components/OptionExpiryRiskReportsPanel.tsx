import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { optionsService } from '../../../lib/services';
import type { OptionExpiryRiskReport, OptionExpiryRiskReportItem, OptionExpiryRiskReportListItem } from '../../../lib/services/types';
import { Theme, themes } from '../../../lib/theme';
import { renderMarkdown } from '../../../shared/utils/markdown';
import { OptionPayoffCalculatorChart } from './OptionPayoffCalculatorChart';
import type { PayoffChartEngine } from './OptionPayoffCalculatorChart';

interface OptionExpiryRiskReportsPanelProps {
  theme: Theme;
  selectedAccountId: string | null;
  standaloneHref?: string;
  chartEngine?: PayoffChartEngine;
  onChartEngineChange?: (engine: PayoffChartEngine) => void;
}

type ExpiryOption = { expiry_date: string; phase?: string; days_to_expiry?: number };

const normalizeIsoDateParam = (value: string | null | undefined) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return '';
  const ts = Date.parse(`${trimmed}T00:00:00Z`);
  return Number.isFinite(ts) ? trimmed : '';
};

const getReportExpiryItems = (report: OptionExpiryRiskReport | null | undefined): OptionExpiryRiskReportItem[] => {
  if (!report) return [];
  if (Array.isArray(report.items) && report.items.length > 0) return report.items;
  return Array.isArray(report.expiries) ? report.expiries : [];
};

const normalizeReportDate = (item: unknown) => {
  if (!item || typeof item !== 'object') return '';
  const value = (item as { report_date?: unknown; reportDate?: unknown }).report_date
    ?? (item as { reportDate?: unknown }).reportDate;
  return typeof value === 'string' ? value : '';
};

const toUtcDate = (yyyyMmDd: string) => {
  const ts = Date.parse(`${yyyyMmDd}T00:00:00Z`);
  return Number.isFinite(ts) ? new Date(ts) : null;
};

const sortExpiryAsc = (a: string, b: string) => {
  const da = toUtcDate(a)?.getTime() ?? Number.NaN;
  const db = toUtcDate(b)?.getTime() ?? Number.NaN;
  if (!Number.isFinite(da) || !Number.isFinite(db)) return a.localeCompare(b);
  return da - db;
};

const pickNearestExpiry = (reportDate: string, expiries: ExpiryOption[]) => {
  const base = toUtcDate(reportDate);
  if (!base || expiries.length === 0) return expiries[0]?.expiry_date || '';
  const baseTs = base.getTime();
  const parsed = expiries
    .map((x) => ({ ...x, ts: toUtcDate(x.expiry_date)?.getTime() ?? Number.NaN }))
    .filter((x) => Number.isFinite(x.ts));
  const future = parsed.filter((x) => x.ts >= baseTs).sort((a, b) => a.ts - b.ts);
  if (future.length > 0) return future[0].expiry_date;
  const past = parsed.sort((a, b) => b.ts - a.ts);
  return past[0]?.expiry_date || '';
};

const splitExpirySectionsFromMarkdown = (markdown: string) => {
  const raw = typeof markdown === 'string' ? markdown : '';
  const lines = raw.split(/\r?\n/);
  const sections: Array<{ expiry_date: string; phase?: string; markdown: string }> = [];
  const prelude: string[] = [];
  let current: { expiry_date: string; phase?: string; lines: string[] } | null = null;
  const headingRe = /^##\s+(\d{4}-\d{2}-\d{2})(?:\s*-\s*([^\n]+))?\s*$/;

  for (const line of lines) {
    const match = line.match(headingRe);
    if (match) {
      if (current) {
        sections.push({
          expiry_date: current.expiry_date,
          phase: current.phase,
          markdown: current.lines.join('\n').trim(),
        });
      }
      current = { expiry_date: match[1], phase: match[2]?.trim(), lines: [] };
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      prelude.push(line);
    }
  }

  if (current) {
    sections.push({
      expiry_date: current.expiry_date,
      phase: current.phase,
      markdown: current.lines.join('\n').trim(),
    });
  }

  return { prelude: prelude.join('\n').trim(), sections };
};

export function OptionExpiryRiskReportsPanel({
  theme,
  selectedAccountId,
  standaloneHref,
  chartEngine = 'tradingview',
  onChartEngineChange,
}: OptionExpiryRiskReportsPanelProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [expiryRiskHistory, setExpiryRiskHistory] = useState<OptionExpiryRiskReportListItem[]>([]);
  const [selectedRiskReportDate, setSelectedRiskReportDate] = useState<string>('');
  const [availableExpiries, setAvailableExpiries] = useState<ExpiryOption[]>([]);
  const [selectedExpiryDate, setSelectedExpiryDate] = useState<string>('');
  const [isExpiryIndexLoading, setIsExpiryIndexLoading] = useState(false);
  const [selectedRiskReport, setSelectedRiskReport] = useState<OptionExpiryRiskReport | null>(null);
  const [isRiskReportLoading, setIsRiskReportLoading] = useState(false);
  const [riskReportError, setRiskReportError] = useState<string | null>(null);
  const [riskReportReloadSeq, setRiskReportReloadSeq] = useState(0);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedReportDate =
    normalizeIsoDateParam(searchParams.get('report')) || normalizeIsoDateParam(searchParams.get('report_date'));
  const requestedExpiryDate =
    normalizeIsoDateParam(searchParams.get('expiry_date')) || normalizeIsoDateParam(searchParams.get('expiry'));
  const updateExpiryRiskParams = useCallback((updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(location.search);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });
    const nextQuery = nextParams.toString();
    const currentQuery = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    if (nextQuery === currentQuery) return;
    navigate(`${location.pathname}${nextQuery ? `?${nextQuery}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    let cancelled = false;

    const load = async () => {
      setIsRiskReportLoading(true);
      setRiskReportError(null);
      setSelectedRiskReport(null);
      setAvailableExpiries([]);
      setSelectedExpiryDate('');

      try {
        const { data, error: listError } = await optionsService.listOptionExpiryRiskReports(selectedAccountId, { limit: 30 });
        if (listError) throw listError;
        if (cancelled) return;

        const list = Array.isArray(data) ? data : [];
        const normalized = list
          .map((x) => {
            if (!x || typeof x !== 'object') return null;
            const item = x as OptionExpiryRiskReportListItem;
            const reportDate = normalizeReportDate(item);
            if (!reportDate) return null;
            return { ...item, report_date: reportDate };
          })
          .filter((x): x is OptionExpiryRiskReportListItem => !!x && !!x.report_date);

        normalized.sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime());
        setExpiryRiskHistory(normalized);
      } catch (err) {
        if (cancelled) return;
        setRiskReportError(err instanceof Error ? err.message : 'Failed to load expiry risk reports');
      } finally {
        if (!cancelled) setIsRiskReportLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, riskReportReloadSeq]);

  useEffect(() => {
    const latestDate = expiryRiskHistory[0]?.report_date || '';
    setSelectedRiskReportDate((prev) => {
      if (requestedReportDate && expiryRiskHistory.some((x) => x.report_date === requestedReportDate)) {
        return requestedReportDate;
      }
      if (prev && expiryRiskHistory.some((x) => x.report_date === prev)) return prev;
      return latestDate;
    });
  }, [expiryRiskHistory, requestedReportDate]);

  useEffect(() => {
    if (!selectedAccountId || !selectedRiskReportDate) return;
    let cancelled = false;

    const load = async () => {
      setIsExpiryIndexLoading(true);
      setRiskReportError(null);
      setSelectedRiskReport(null);
      setAvailableExpiries([]);
      setSelectedExpiryDate('');
      try {
        const { data, error: getError } = await optionsService.getOptionExpiryRiskReport(selectedAccountId, selectedRiskReportDate);
        if (getError) throw getError;
        if (cancelled) return;

        const items = getReportExpiryItems(data);
        const fromItems: ExpiryOption[] = items
          .filter((x): x is OptionExpiryRiskReportItem => !!x && typeof x === 'object' && typeof (x as OptionExpiryRiskReportItem).expiry_date === 'string')
          .map((x) => ({ expiry_date: x.expiry_date, phase: x.phase, days_to_expiry: x.days_to_expiry }));

        const fromMarkdown: ExpiryOption[] = typeof data?.report_markdown === 'string'
          ? splitExpirySectionsFromMarkdown(data.report_markdown).sections.map((s) => ({ expiry_date: s.expiry_date, phase: s.phase }))
          : [];

        const map = new Map<string, ExpiryOption>();
        for (const x of [...fromItems, ...fromMarkdown]) {
          if (!x.expiry_date) continue;
          const prev = map.get(x.expiry_date);
          map.set(x.expiry_date, {
            expiry_date: x.expiry_date,
            phase: prev?.phase || x.phase,
            days_to_expiry: typeof prev?.days_to_expiry === 'number' ? prev.days_to_expiry : x.days_to_expiry,
          });
        }

        const list = Array.from(map.values()).sort((a, b) => sortExpiryAsc(a.expiry_date, b.expiry_date));
        setAvailableExpiries(list);
      } catch (err) {
        if (cancelled) return;
        setRiskReportError(err instanceof Error ? err.message : 'Failed to load expiry risk report');
      } finally {
        if (!cancelled) setIsExpiryIndexLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, selectedRiskReportDate, riskReportReloadSeq]);

  useEffect(() => {
    setSelectedExpiryDate((prev) => {
      if (requestedExpiryDate && availableExpiries.some((x) => x.expiry_date === requestedExpiryDate)) {
        return requestedExpiryDate;
      }
      if (prev && availableExpiries.some((x) => x.expiry_date === prev)) return prev;
      return pickNearestExpiry(selectedRiskReportDate, availableExpiries);
    });
  }, [availableExpiries, requestedExpiryDate, selectedRiskReportDate]);

  useEffect(() => {
    if (!selectedAccountId) return;
    updateExpiryRiskParams({
      report: selectedRiskReportDate || null,
      report_date: null,
      expiry_date: selectedExpiryDate || null,
      expiry: null,
    });
  }, [selectedAccountId, selectedExpiryDate, selectedRiskReportDate, updateExpiryRiskParams]);

  useEffect(() => {
    if (!selectedAccountId || !selectedRiskReportDate || !selectedExpiryDate) return;
    let cancelled = false;

    const load = async () => {
      setIsRiskReportLoading(true);
      setRiskReportError(null);
      setSelectedRiskReport(null);
      try {
        const { data, error: getError } = await optionsService.getOptionExpiryRiskReport(selectedAccountId, selectedRiskReportDate, {
          expiry_date: selectedExpiryDate,
        });
        if (getError) throw getError;
        if (cancelled) return;
        setSelectedRiskReport(data);
      } catch (err) {
        if (cancelled) return;
        setRiskReportError(err instanceof Error ? err.message : 'Failed to load expiry risk report');
      } finally {
        if (!cancelled) setIsRiskReportLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId, selectedRiskReportDate, selectedExpiryDate, riskReportReloadSeq]);

  if (!selectedAccountId) {
    return (
      <section className={`${themes[theme].card} rounded-lg p-4 sm:p-6 shadow-sm border ${themes[theme].border}`}>
        <div className={`text-sm ${themes[theme].text} opacity-70`}>请选择账户后查看期权到期风险日报。</div>
      </section>
    );
  }

  return (
    <section className={`${themes[theme].card} rounded-lg p-4 sm:p-6 shadow-sm border ${themes[theme].border}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className={`text-xl font-bold ${themes[theme].text}`}>期权到期风险日报</h2>
          <p className={`text-sm ${themes[theme].text} opacity-75 mt-1`}>
            打开本页会自动加载最新一份日报，可切换历史日期查看。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            value={chartEngine}
            onChange={(e) => onChartEngineChange?.(e.target.value as PayoffChartEngine)}
            className={`w-full max-w-full px-3 py-2 rounded-md text-sm sm:w-auto ${themes[theme].input} ${themes[theme].text}`}
          >
            <option value="tradingview">TradingView</option>
            <option value="plotly">Plotly</option>
            <option value="echarts">ECharts</option>
          </select>
          <select
            value={selectedRiskReportDate}
            onChange={(e) => setSelectedRiskReportDate(e.target.value)}
            disabled={isRiskReportLoading || isExpiryIndexLoading || expiryRiskHistory.length === 0}
            className={`w-full max-w-full px-3 py-2 rounded-md text-sm sm:w-auto ${themes[theme].input} ${themes[theme].text} ${
              isRiskReportLoading || isExpiryIndexLoading || expiryRiskHistory.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {expiryRiskHistory.length === 0 ? (
              <option value="">暂无日报</option>
            ) : (
              expiryRiskHistory.map((x) => (
                <option key={x.report_date} value={x.report_date}>
                  {x.report_date}
                </option>
              ))
            )}
          </select>
          <select
            value={selectedExpiryDate}
            onChange={(e) => setSelectedExpiryDate(e.target.value)}
            disabled={isRiskReportLoading || isExpiryIndexLoading || availableExpiries.length === 0}
            className={`w-full max-w-full px-3 py-2 rounded-md text-sm sm:w-auto ${themes[theme].input} ${themes[theme].text} ${
              isRiskReportLoading || isExpiryIndexLoading || availableExpiries.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {availableExpiries.length === 0 ? (
              <option value="">选择到期日</option>
            ) : (
              availableExpiries.map((x) => (
                <option key={x.expiry_date} value={x.expiry_date}>
                  {x.expiry_date}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => setRiskReportReloadSeq((s) => s + 1)}
            className={`w-full px-3 py-2 rounded-md text-sm sm:w-auto ${themes[theme].secondary}`}
          >
            刷新
          </button>
          {standaloneHref ? (
            <Link to={standaloneHref} className={`w-full px-3 py-2 rounded-md text-sm text-center sm:w-auto ${themes[theme].secondary}`}>
              打开到期日报
            </Link>
          ) : null}
        </div>
      </div>

      {riskReportError && (
        <div className="text-sm text-red-600 dark:text-red-400">{riskReportError}</div>
      )}

      {(isRiskReportLoading || isExpiryIndexLoading) && (
        <div className="flex items-center gap-2 py-2">
          <Loader className="w-4 h-4 animate-spin text-blue-500" />
          <span className={`text-sm ${themes[theme].text} opacity-75`}>加载中...</span>
        </div>
      )}

      {!isRiskReportLoading && !isExpiryIndexLoading && !riskReportError && expiryRiskHistory.length === 0 && (
        <div className={`text-sm ${themes[theme].text} opacity-70`}>暂无历史日报</div>
      )}

      {!isRiskReportLoading && !isExpiryIndexLoading && !riskReportError && selectedRiskReport && (
        (() => {
          const items = getReportExpiryItems(selectedRiskReport);
          const item = selectedExpiryDate
            ? items.find((x) => x.expiry_date === selectedExpiryDate) ?? items[0]
            : items[0];

          const parsed = typeof selectedRiskReport.report_markdown === 'string'
            ? splitExpirySectionsFromMarkdown(selectedRiskReport.report_markdown)
            : { prelude: '', sections: [] as Array<{ expiry_date: string; phase?: string; markdown: string }> };
          const markdownFromSection = selectedExpiryDate
            ? parsed.sections.find((s) => s.expiry_date === selectedExpiryDate)?.markdown ?? ''
            : (parsed.sections[0]?.markdown ?? '');

          const selectedMeta = item;
          const selectedMarkdown = typeof item?.report === 'string'
            ? item.report
            : (markdownFromSection || (typeof selectedRiskReport.report_markdown === 'string' ? selectedRiskReport.report_markdown : ''));
          const selectedPhase = item?.phase || (selectedExpiryDate ? parsed.sections.find((s) => s.expiry_date === selectedExpiryDate)?.phase : undefined);
          const selectedPayoffPayload = item?.payoff_calculator ?? selectedRiskReport;

          return (
            <div className="space-y-4">
              <div className={`border rounded-lg ${themes[theme].border} bg-white p-3 dark:bg-gray-900/20 sm:p-4`}>
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className={`font-semibold ${themes[theme].text}`}>{selectedExpiryDate || '到期日'}</div>
                  {selectedPhase ? (
                    <div className={`w-fit text-xs px-2 py-1 rounded ${themes[theme].secondary}`}>
                      {selectedPhase}
                    </div>
                  ) : null}
                </div>

                {selectedMeta ? (
                  <div className={`text-xs ${themes[theme].text} opacity-70 mb-3 flex flex-wrap gap-x-3 gap-y-1`}>
                    {typeof selectedMeta.days_to_expiry === 'number' ? <span>剩余天数: {selectedMeta.days_to_expiry}</span> : null}
                    {typeof selectedMeta.risk_positions_count === 'number' ? <span>风险: {selectedMeta.risk_positions_count}</span> : null}
                    {typeof selectedMeta.safe_positions_count === 'number' ? <span>安全: {selectedMeta.safe_positions_count}</span> : null}
                    {typeof selectedMeta.strategies_count === 'number' ? <span>策略: {selectedMeta.strategies_count}</span> : null}
                  </div>
                ) : null}

                {selectedPayoffPayload ? (
                  <div className="mb-4">
                    <OptionPayoffCalculatorChart
                      theme={theme}
                      payload={selectedPayoffPayload}
                      chartEngine={chartEngine}
                    />
                  </div>
                ) : null}

                {selectedMarkdown.trim() ? (
                  <div className="prose prose-sm max-w-none">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(selectedMarkdown, theme),
                      }}
                    />
                  </div>
                ) : (
                  <div className={`text-sm ${themes[theme].text} opacity-70`}>暂无分析内容</div>
                )}
              </div>
            </div>
          );
        })()
      )}
    </section>
  );
}
