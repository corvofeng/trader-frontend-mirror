import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Copy,
  Download,
  Check,
  Shield,
  Eye,
  EyeOff,
  Coins,
  TrendingUp,
  Award,
  Receipt,
  FileCheck2,
  Sparkles,
  Sun,
  Moon,
  Share2,
  Calculator,
  ChevronDown,
  FileText,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { Theme } from '../../../lib/theme';
import type { DividendPlanResult, PartnerDividendItem } from './cashFlowDividendUtils';
import { getCounterpartyMeta } from './CashFlowCounterpartyCharts';

interface CashFlowDividendShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  accountAlias: string;
  plan: DividendPlanResult;
  settleDate: string;
  allCounterparties: string[];
  initialMasked?: boolean;
  isFlowsRecorded?: boolean;
  initialViewMode?: 'all' | 'single';
  initialPartnerRawName?: string;
}

export function CashFlowDividendShareModal({
  isOpen,
  onClose,
  theme,
  accountAlias,
  plan,
  settleDate,
  allCounterparties,
  initialMasked = true,
  isFlowsRecorded = false,
  initialViewMode = 'all',
  initialPartnerRawName,
}: CashFlowDividendShareModalProps) {
  // Privacy mask toggle (defaults to true as requested for sharing)
  const [maskHashed, setMaskHashed] = useState(initialMasked);
  // Modal card style theme: 'light' | 'dark'
  const [cardStyle, setCardStyle] = useState<'light' | 'dark'>(() => (theme === 'dark' ? 'dark' : 'light'));
  // Share mode: 'all' (全员总账单) | 'single' (个人专属结算单)
  const [viewMode, setViewMode] = useState<'all' | 'single'>(initialViewMode);
  // Selected partner name for single view
  const [selectedPartnerRawName, setSelectedPartnerRawName] = useState<string>(() => initialPartnerRawName || plan.items[0]?.rawName || '');

  // Synchronize when modal opens or initial props change
  React.useEffect(() => {
    if (isOpen) {
      if (initialPartnerRawName) {
        setSelectedPartnerRawName(initialPartnerRawName);
        setViewMode('single');
      } else if (initialViewMode) {
        setViewMode(initialViewMode);
      }
    }
  }, [isOpen, initialPartnerRawName, initialViewMode]);
  // Expanded calculation breakdown state for partners in 'all' view
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set());
  // Copying / Downloading / PDF loading states
  const [isCapturing, setIsCapturing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // Currently selected partner item for single view
  const currentSingleItem: PartnerDividendItem | undefined = useMemo(() => {
    return plan.items.find((it) => it.rawName === selectedPartnerRawName) || plan.items[0];
  }, [plan.items, selectedPartnerRawName]);

  const currentSingleMeta = useMemo(() => {
    if (!currentSingleItem) return null;
    return getCounterpartyMeta(currentSingleItem.rawName, allCounterparties, maskHashed);
  }, [currentSingleItem, allCounterparties, maskHashed]);

  const currentPartnerDisplayName = currentSingleMeta?.displayName || currentSingleItem?.rawName || '合伙人';

  // Partner navigation in single mode
  const currentPartnerIndex = useMemo(() => {
    return plan.items.findIndex((it) => it.rawName === selectedPartnerRawName);
  }, [plan.items, selectedPartnerRawName]);

  const handlePrevPartner = () => {
    if (plan.items.length <= 1) return;
    const nextIdx = currentPartnerIndex <= 0 ? plan.items.length - 1 : currentPartnerIndex - 1;
    setSelectedPartnerRawName(plan.items[nextIdx].rawName);
  };

  const handleNextPartner = () => {
    if (plan.items.length <= 1) return;
    const nextIdx = currentPartnerIndex >= plan.items.length - 1 ? 0 : currentPartnerIndex + 1;
    setSelectedPartnerRawName(plan.items[nextIdx].rawName);
  };

  // Toggle single partner calculation breakdown in 'all' view
  const handleTogglePartner = (rawName: string) => {
    setExpandedPartners((prev) => {
      const next = new Set(prev);
      if (next.has(rawName)) next.delete(rawName);
      else next.add(rawName);
      return next;
    });
  };

  // Toggle all partners calculation breakdown
  const handleToggleAllPartners = () => {
    if (expandedPartners.size === plan.items.length) {
      setExpandedPartners(new Set());
    } else {
      setExpandedPartners(new Set(plan.items.map((it) => it.rawName)));
    }
  };

  // Switch to single view for a specific partner
  const handleOpenSinglePartnerView = (rawName: string) => {
    setSelectedPartnerRawName(rawName);
    setViewMode('single');
  };

  // Helper format money
  const formatMoney = (val: number) => {
    return `¥${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Pooled Tier Revenue Summary (全资金池收益阶段汇总报告)
  const pooledTierSummary = useMemo(() => {
    let tier1TotalProfit = 0;
    let tier1TotalFee = 0;
    let tier2TotalProfit = 0;
    let tier2TotalFee = 0;

    for (const item of plan.items) {
      if (item.tierDetail) {
        tier1TotalProfit += item.tierDetail.tier1Profit || 0;
        tier1TotalFee += item.tierDetail.tier1Fee || 0;
        tier2TotalProfit += item.tierDetail.tier2Profit || 0;
        tier2TotalFee += item.tierDetail.tier2Fee || 0;
      } else {
        tier1TotalProfit += item.grossProfitShare || 0;
        tier1TotalFee += item.feeAmount || 0;
      }
    }

    return {
      tier1TotalProfit,
      tier1TotalFee,
      tier1TotalNet: tier1TotalProfit - tier1TotalFee,
      tier2TotalProfit,
      tier2TotalFee,
      tier2TotalNet: tier2TotalProfit - tier2TotalFee,
    };
  }, [plan.items]);

  // Helper render canvas from DOM
  const renderCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    return await html2canvas(cardRef.current, {
      scale: 2.5, // High-DPI / Retina crispness
      useCORS: true,
      backgroundColor: cardStyle === 'light' ? '#f8fafc' : '#09090b',
      logging: false,
      windowWidth: 1280,
    });
  };

  // One-click copy image to system clipboard
  const handleCopyImage = async () => {
    if (isCapturing || isGeneratingPdf) return;
    setIsCapturing(true);
    try {
      const canvas = await renderCanvas();
      if (!canvas) throw new Error('无法渲染截图节点');

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('生成图片数据失败');
          setIsCapturing(false);
          return;
        }

        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            setIsCopied(true);
            const targetDesc = viewMode === 'single' ? `【${currentPartnerDisplayName}】个人结算单` : '分红结算账单';
            toast.success(`已将${targetDesc}复制到剪贴板！微信直接粘贴 (Ctrl+V)`);
            setTimeout(() => setIsCopied(false), 3000);
          } else {
            handleDownloadImage();
          }
        } catch (err: any) {
          console.warn('Clipboard image write failed, falling back to download:', err);
          toast('剪贴板图片复制受限，正在为您直接下载图片...', { icon: '📥' });
          handleDownloadImage();
        } finally {
          setIsCapturing(false);
        }
      }, 'image/png');
    } catch (err: any) {
      console.error('Failed to capture image:', err);
      toast.error('截图生成失败，请重试');
      setIsCapturing(false);
    }
  };

  // One-click download image as PNG
  const handleDownloadImage = async () => {
    if (isCapturing || isGeneratingPdf) return;
    setIsCapturing(true);
    try {
      const canvas = await renderCanvas();
      if (!canvas) throw new Error('无法渲染截图节点');

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const partnerTag = viewMode === 'single' ? `-${currentPartnerDisplayName}` : '-全员结算总单';
      const maskTag = maskHashed ? '-脱敏版' : '';
      link.href = dataUrl;
      link.download = `分红结算单-${accountAlias}-${plan.year}年度${partnerTag}${maskTag}-${settleDate}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('结算高清图片已保存到本地！');
    } catch (err: any) {
      console.error('Failed to download image:', err);
      toast.error('保存图片失败，请重试');
    } finally {
      setIsCapturing(false);
    }
  };

  // One-click export PDF file
  const handleExportPdf = async () => {
    if (isCapturing || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const canvas = await renderCanvas();
      if (!canvas) throw new Error('无法生成截图节点');

      // Convert to JPEG for smaller PDF payload size
      const jpegUrl = canvas.toDataURL('image/jpeg', 0.92);
      const pdfWidth = 210; // A4 standard width in mm
      const pdfHeight = (canvas.height / canvas.width) * pdfWidth;

      const pdf = new jsPDF({
        orientation: pdfWidth > pdfHeight ? 'l' : 'p',
        unit: 'mm',
        format: [pdfWidth, pdfHeight],
      });

      pdf.addImage(jpegUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);

      const partnerTag = viewMode === 'single' ? `-${currentPartnerDisplayName}` : '-全员结算总单';
      const maskTag = maskHashed ? '-脱敏版' : '';
      const filename = `分红结算单-${accountAlias}-${plan.year}年度${partnerTag}${maskTag}-${settleDate}.pdf`;
      pdf.save(filename);

      toast.success('分红结算单 PDF 文档导出成功！');
    } catch (err: any) {
      console.error('Failed to export PDF:', err);
      toast.error('导出 PDF 失败，请重试');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Watermark unique verify ID
  const verifyStamp = useMemo(() => {
    let hash = 0;
    const str = `${accountAlias}-${plan.year}-${settleDate}-${plan.totalNetDividend}-${selectedPartnerRawName}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  }, [accountAlias, plan.year, settleDate, plan.totalNetDividend, selectedPartnerRawName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/80 dark:bg-black/85 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[92vh] max-h-[92vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        {/* Modal Top Control Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-900 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
              <Share2 className="w-4 h-4" />
            </div>
            {/* View Mode Tabs */}
            <div className="flex items-center p-1 rounded-xl bg-slate-200/80 dark:bg-zinc-800 border border-slate-300/60 dark:border-zinc-700/60 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'all'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>全员总账单</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'single'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>个人专属结算单</span>
              </button>
            </div>
          </div>

          {/* Quick Options and Close */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* If in 'all' view: Show toggle all calculations */}
            {viewMode === 'all' && (
              <button
                type="button"
                onClick={handleToggleAllPartners}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors shadow-2xs ${
                  expandedPartners.size > 0
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800/60 text-blue-800 dark:text-blue-300 font-semibold'
                    : 'bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300'
                }`}
                title={expandedPartners.size > 0 ? '收起全部计算推导过程' : '展开全部合伙人的分红计算推导过程'}
              >
                <Calculator className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  {expandedPartners.size === plan.items.length
                    ? '收起推导过程'
                    : expandedPartners.size > 0
                    ? `推导过程 (${expandedPartners.size}/${plan.items.length})`
                    : '打开推导过程'}
                </span>
              </button>
            )}

            {/* If in 'single' view: Partner Selector Dropdown and Nav */}
            {viewMode === 'single' && (
              <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg p-0.5 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={handlePrevPartner}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300"
                  title="上一个合伙人"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <select
                  value={selectedPartnerRawName}
                  onChange={(e) => setSelectedPartnerRawName(e.target.value)}
                  className="bg-transparent border-none text-xs font-semibold py-1 px-1.5 text-slate-800 dark:text-zinc-100 focus:outline-hidden cursor-pointer"
                >
                  {plan.items.map((item, idx) => {
                    const m = getCounterpartyMeta(item.rawName, allCounterparties, maskHashed);
                    const name = m?.displayName || (maskHashed ? `合伙人 ${String.fromCharCode(65 + idx)}` : item.rawName);
                    return (
                      <option key={item.rawName} value={item.rawName} className="dark:bg-zinc-900">
                        {name} (分红 ¥{item.netDividend.toFixed(0)})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={handleNextPartner}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300"
                  title="下一个合伙人"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Hash Mask Toggle Button */}
            <button
              type="button"
              onClick={() => setMaskHashed((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors shadow-2xs ${
                maskHashed
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
                  : 'bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300'
              }`}
              title={maskHashed ? '当前已对客户进行 Hash 脱敏保护' : '当前显示真实客户姓名'}
            >
              {maskHashed ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Hash客户脱敏: 开</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span>真实姓名: 开</span>
                </>
              )}
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={() => setCardStyle((prev) => (prev === 'light' ? 'dark' : 'light'))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
              title="切换截图卡片视觉配色"
            >
              {cardStyle === 'light' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">白底卡片</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">暗夜黑金</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Area */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-slate-100 dark:bg-zinc-950/60 flex justify-center items-start">
          {/* Capture Card Container */}
          <div
            ref={cardRef}
            id="dividend-settlement-share-card"
            className={`w-full max-w-3xl rounded-2xl border shadow-xl p-5 sm:p-7 transition-colors select-none shrink-0 ${
              cardStyle === 'light'
                ? 'bg-gradient-to-b from-white via-slate-50/70 to-slate-100/80 border-slate-200/90 text-slate-900'
                : 'bg-gradient-to-b from-zinc-900 via-zinc-900/95 to-black border-zinc-800 text-zinc-100'
            }`}
          >
            {/* ======================================================== */}
            {/* MODE A: FULL PARTNERSHIP BILL (全员总账单视图) */}
            {/* ======================================================== */}
            {viewMode === 'all' && (
              <>
                {/* 1. Header Banner */}
                <div className="flex items-start justify-between gap-4 pb-5 border-b border-dashed border-slate-200 dark:border-zinc-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Award className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                        Partnership Dividend Settlement
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                      <span>合伙资金收益分红结算报告</span>
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500 dark:text-zinc-400">
                      <span className="font-semibold text-slate-700 dark:text-zinc-300">
                        账户: <span className="font-mono">{accountAlias}</span>
                      </span>
                      <span>•</span>
                      <span>结算年度: <strong className="text-slate-800 dark:text-zinc-200">{plan.year} 自然年</strong></span>
                      <span>•</span>
                      <span>基准日: <span className="font-mono">{settleDate}</span></span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>履约强制分红</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 mt-1">
                      NO. {verifyStamp}
                    </div>
                  </div>
                </div>

                {/* 2. Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 py-4">
                  {/* Pool Principal */}
                  <div
                    className={`p-3 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-white/80 border-slate-200/80 shadow-2xs'
                        : 'bg-zinc-800/60 border-zinc-700/60'
                    }`}
                  >
                    <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                      有效总本金 (底仓)
                    </div>
                    <div className="text-base sm:text-lg font-mono font-black mt-1 text-slate-900 dark:text-zinc-100">
                      {formatMoney(plan.totalPoolPrincipal)}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      原始出资本金总池
                    </div>
                  </div>

                  {/* Total Asset */}
                  <div
                    className={`p-3 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-white/80 border-slate-200/80 shadow-2xs'
                        : 'bg-zinc-800/60 border-zinc-700/60'
                    }`}
                  >
                    <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                      账户当前总资产
                    </div>
                    <div className="text-base sm:text-lg font-mono font-black mt-1 text-blue-600 dark:text-blue-400">
                      {formatMoney(plan.totalAccountAsset)}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      可用资金 + 持仓市值
                    </div>
                  </div>

                  {/* Total Net Profit */}
                  <div
                    className={`p-3 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-white/80 border-slate-200/80 shadow-2xs'
                        : 'bg-zinc-800/60 border-zinc-700/60'
                    }`}
                  >
                    <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                      <span>累计实现盈利</span>
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                    </div>
                    <div className="text-base sm:text-lg font-mono font-black mt-1 text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(plan.totalProfit)}
                    </div>
                    <div className="text-[10px] font-medium text-emerald-600/90 dark:text-emerald-400/90 mt-0.5">
                      收益率 +{(plan.totalProfitRate * 100).toFixed(2)}%
                    </div>
                  </div>

                  {/* Total Net Dividend */}
                  <div
                    className={`p-3 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-emerald-50/70 border-emerald-200 shadow-2xs text-emerald-950'
                        : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-100'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                      <span>投资人分红 (实发)</span>
                      <Coins className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-base sm:text-lg font-mono font-black mt-1 text-emerald-600 dark:text-emerald-300">
                      {formatMoney(plan.totalNetDividend)}
                    </div>
                    <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      平均净收益率 +{(plan.totalNetDividendRate * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* 3. Partner Breakdown Table & Revenue Stage Report */}
                <div className="mt-2 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-zinc-200">
                      <Receipt className="w-3.5 h-3.5 text-blue-500" />
                      <span>各位合伙人出资与分红明细清算</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleAllPartners}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                      >
                        {expandedPartners.size === plan.items.length ? '折叠全部计算过程' : '展开全部计算过程'}
                      </button>
                      {maskHashed && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium hidden sm:inline">
                          🔒 已开启客户姓名 Hash 脱敏保护
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pooled Revenue Stage Report Banner (全资金池收益阶段报告) */}
                  {expandedPartners.size > 0 && plan.feeMode === 'progressive' && (
                    <div
                      className={`p-3 rounded-xl border space-y-2 text-xs transition-all animate-in fade-in duration-150 ${
                        cardStyle === 'light'
                          ? 'bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-emerald-50/50 border-blue-200/80 text-slate-800'
                          : 'bg-gradient-to-r from-blue-950/30 via-indigo-950/30 to-emerald-950/20 border-blue-900/60 text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-blue-200/60 dark:border-blue-900/60 pb-1.5">
                        <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-200">
                          <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>全资金池超额累进制收益阶段分配总览</span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                          约定规则: 5%以内收10% · 超出5%收50%
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                        {/* Stage 1: <= 5% */}
                        <div
                          className={`p-2 rounded-lg border space-y-1 ${
                            cardStyle === 'light'
                              ? 'bg-white/80 border-emerald-200/80'
                              : 'bg-zinc-900/60 border-emerald-900/40'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <span>阶段①：≤5% 基准收益 (提成 10%)</span>
                            <span className="font-mono">{formatMoney(pooledTierSummary.tier1TotalProfit)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
                            <span>扣手续费: -{formatMoney(pooledTierSummary.tier1TotalFee)}</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              投资人实发: +{formatMoney(pooledTierSummary.tier1TotalNet)}
                            </span>
                          </div>
                        </div>

                        {/* Stage 2: > 5% */}
                        <div
                          className={`p-2 rounded-lg border space-y-1 ${
                            cardStyle === 'light'
                              ? 'bg-white/80 border-amber-200/80'
                              : 'bg-zinc-900/60 border-amber-900/40'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            <span>阶段②：&gt;5% 超额收益 (提成 50%)</span>
                            <span className="font-mono">{formatMoney(pooledTierSummary.tier2TotalProfit)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
                            <span>扣手续费: -{formatMoney(pooledTierSummary.tier2TotalFee)}</span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              投资人实发: +{formatMoney(pooledTierSummary.tier2TotalNet)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Visual Proportion Bar */}
                      {plan.totalGrossProfit > 0 && (
                        <div className="pt-0.5 space-y-1">
                          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex">
                            <div
                              style={{
                                width: `${Math.min(
                                  100,
                                  (pooledTierSummary.tier1TotalProfit / plan.totalGrossProfit) * 100
                                )}%`,
                              }}
                              className="bg-emerald-500 h-full"
                              title="5%以内基准收益"
                            />
                            <div
                              style={{
                                width: `${Math.max(
                                  0,
                                  (pooledTierSummary.tier2TotalProfit / plan.totalGrossProfit) * 100
                                )}%`,
                              }}
                              className="bg-amber-500 h-full"
                              title="超出5%超额收益"
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 font-sans">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              ■ 5%以内基准收益 ({((pooledTierSummary.tier1TotalProfit / plan.totalGrossProfit) * 100).toFixed(1)}%)
                            </span>
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              ■ 超出5%超额收益 ({((pooledTierSummary.tier2TotalProfit / plan.totalGrossProfit) * 100).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    className={`overflow-hidden rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-white border-slate-200/90 shadow-2xs'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr
                          className={`border-b text-[11px] font-semibold whitespace-nowrap ${
                            cardStyle === 'light'
                              ? 'bg-slate-50/90 border-slate-200 text-slate-500'
                              : 'bg-zinc-800/70 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          <th className="py-2.5 pl-2 pr-1 w-6 text-center"></th>
                          <th className="py-2.5 px-3">合伙人</th>
                          <th className="py-2.5 px-2 text-right">出资成本</th>
                          <th className="py-2.5 px-2 text-right">出资占比</th>
                          <th className="py-2.5 px-2 text-right">分配毛利</th>
                          <th className="py-2.5 px-2 text-right">提成扣除</th>
                          <th className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            应发现金分红
                          </th>
                          <th className="py-2.5 px-3 text-right">留存底仓</th>
                          <th className="py-2.5 px-2 text-center w-10">个人单</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 font-mono">
                        {plan.items.map((item, idx) => {
                          const meta = getCounterpartyMeta(item.rawName, allCounterparties, maskHashed);
                          const displayName = meta?.displayName || (maskHashed ? `合伙人 ${String.fromCharCode(65 + idx)}` : item.rawName);
                          const isExpanded = expandedPartners.has(item.rawName);

                          return (
                            <React.Fragment key={item.rawName}>
                              <tr
                                onClick={() => handleTogglePartner(item.rawName)}
                                className={`cursor-pointer transition-colors ${
                                  isExpanded
                                    ? cardStyle === 'light'
                                      ? 'bg-blue-50/40'
                                      : 'bg-blue-950/20'
                                    : cardStyle === 'light'
                                    ? 'hover:bg-slate-50/50'
                                    : 'hover:bg-zinc-800/40'
                                }`}
                              >
                                {/* Toggle Arrow */}
                                <td className="py-2.5 pl-2 pr-1 text-center whitespace-nowrap">
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                      isExpanded
                                        ? 'rotate-180 text-blue-600 dark:text-blue-400'
                                        : 'text-slate-400'
                                    }`}
                                  />
                                </td>

                                {/* Partner Name with Color Dot */}
                                <td className="py-2.5 px-3 whitespace-nowrap font-sans font-medium text-slate-800 dark:text-zinc-200">
                                  <div className="flex items-center gap-1.5">
                                    {meta?.color && (
                                      <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: meta.color }}
                                      />
                                    )}
                                    <span>{displayName}</span>
                                    {item.isReentered && (
                                      <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-sans">
                                        再入场
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Net Principal */}
                                <td className="py-2.5 px-2 text-right whitespace-nowrap text-slate-600 dark:text-zinc-300">
                                  ¥{item.netPrincipal.toLocaleString('zh-CN')}
                                </td>

                                {/* Share Ratio */}
                                <td className="py-2.5 px-2 text-right whitespace-nowrap text-slate-500 dark:text-zinc-400">
                                  {(item.shareRatio * 100).toFixed(1)}%
                                </td>

                                {/* Gross Profit Share */}
                                <td className="py-2.5 px-2 text-right whitespace-nowrap text-slate-700 dark:text-zinc-300">
                                  ¥{item.grossProfitShare.toFixed(2)}
                                </td>

                                {/* Fee Deducted */}
                                <td className="py-2.5 px-2 text-right whitespace-nowrap text-rose-600/90 dark:text-rose-400/90">
                                  -¥{item.feeAmount.toFixed(2)}
                                </td>

                                {/* Net Dividend (Highlighted) */}
                                <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                                  ¥{item.netDividend.toFixed(2)}
                                </td>

                                {/* Remaining Principal (Preserved) */}
                                <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold text-slate-700 dark:text-zinc-200">
                                  ¥{item.remainingPrincipal.toLocaleString('zh-CN')}
                                </td>

                                {/* Quick Single Bill Button */}
                                <td className="py-2.5 px-2 text-center whitespace-nowrap font-sans">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenSinglePartnerView(item.rawName);
                                    }}
                                    className="p-1 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors"
                                    title={`生成【${displayName}】个人专属结算单`}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>

                              {/* Expanded Calculation Process Breakdown (优化后排版无错位) */}
                              {isExpanded && (
                                <tr
                                  className={`border-b ${
                                    cardStyle === 'light'
                                      ? 'bg-blue-50/20 border-slate-200'
                                      : 'bg-zinc-900/80 border-zinc-800'
                                  }`}
                                >
                                  <td colSpan={9} className="p-3 sm:p-4">
                                    <div
                                      className={`rounded-xl border p-3 sm:p-3.5 space-y-2.5 ${
                                        cardStyle === 'light'
                                          ? 'bg-white border-blue-200/80 shadow-2xs'
                                          : 'bg-zinc-900 border-zinc-700/80'
                                      }`}
                                    >
                                      {/* Drawer Header */}
                                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className="p-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                                            📐 计算推导过程
                                          </span>
                                          <span className="font-bold text-slate-800 dark:text-zinc-200 text-xs font-sans">
                                            {displayName}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenSinglePartnerView(item.rawName)}
                                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-sans font-medium"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                            <span>生成此人专属单</span>
                                          </button>
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-sans">
                                            {plan.feeMode === 'progressive' ? '超额累进制: 5%以内10%, 超出50%' : '固定费率制'}
                                          </span>
                                          {item.isReentered && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-semibold border border-rose-300 dark:border-rose-800 font-sans">
                                              ⚠️ 规则4：当年离场重入 (50%提成)
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* 3 Step Deductions (优化宽度与换行布局) */}
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                                        {/* Step 1 */}
                                        <div
                                          className={`p-2.5 rounded-lg border space-y-1.5 ${
                                            cardStyle === 'light'
                                              ? 'bg-slate-50/80 border-slate-200/80'
                                              : 'bg-zinc-800/40 border-zinc-800'
                                          }`}
                                        >
                                          <div className="text-slate-700 dark:text-zinc-200 font-semibold flex items-center gap-1 font-sans text-[11px] whitespace-nowrap">
                                            <span className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-[9px] shrink-0">
                                              1
                                            </span>
                                            <span>出资与毛收益分配</span>
                                          </div>
                                          <div className="space-y-1 text-[11px] text-slate-600 dark:text-zinc-400">
                                            <div className="flex justify-between items-center">
                                              <span>净出资本金:</span>
                                              <span className="font-semibold font-mono text-slate-800 dark:text-zinc-200">¥{item.netPrincipal.toLocaleString('zh-CN')}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span>资金池出资占比:</span>
                                              <span className="font-semibold font-mono">{(item.shareRatio * 100).toFixed(2)}%</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span>分配毛收益:</span>
                                              <span className="font-semibold font-mono text-slate-800 dark:text-zinc-200">¥{item.grossProfitShare.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-blue-600 dark:text-blue-400 font-semibold">
                                              <span>个人毛收益率:</span>
                                              <span className="font-mono">+{((item.profitRate || 0) * 100).toFixed(2)}%</span>
                                            </div>
                                            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-200/60 dark:border-zinc-800">
                                              <span>5% 门槛收益基准:</span>
                                              <span className="font-mono">¥{(item.tierDetail?.hurdleProfitThreshold || item.netPrincipal * 0.05).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Step 2 (结构化微型卡片，彻底避免折行挤出) */}
                                        <div
                                          className={`p-2.5 rounded-lg border space-y-1.5 ${
                                            cardStyle === 'light'
                                              ? 'bg-indigo-50/40 border-indigo-200/60'
                                              : 'bg-indigo-950/20 border-indigo-900/40'
                                          }`}
                                        >
                                          <div className="text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-between text-[11px] whitespace-nowrap gap-1">
                                            <div className="flex items-center gap-1 font-sans shrink-0">
                                              <span className="w-3.5 h-3.5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[9px] shrink-0">
                                                2
                                              </span>
                                              <span className="whitespace-nowrap">手续费提成测算</span>
                                            </div>
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100/70 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium whitespace-nowrap shrink-0">
                                              综合 {(item.feeRate * 100).toFixed(1)}%
                                            </span>
                                          </div>

                                          {item.isReentered ? (
                                            <div className="text-[11px] text-rose-600 dark:text-rose-400 space-y-1">
                                              <div className="font-medium">规则4惩罚: 当年曾重入，全额按 50% 扣除</div>
                                              <div className="font-semibold font-mono">¥{item.grossProfitShare.toFixed(2)} × 50% = -¥{item.feeAmount.toFixed(2)}</div>
                                            </div>
                                          ) : item.tierDetail ? (
                                            <div className="space-y-1 text-[10px] text-slate-600 dark:text-zinc-400">
                                              {/* Tier 1 mini card */}
                                              <div className="p-1.5 rounded bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 space-y-0.5">
                                                <div className="flex items-center justify-between font-sans text-emerald-700 dark:text-emerald-400 font-medium whitespace-nowrap">
                                                  <span>阶梯① (≤5% 基准毛利)</span>
                                                  <span className="font-mono text-[10px]">计提 10%</span>
                                                </div>
                                                <div className="flex items-center justify-between font-mono text-[10.5px] whitespace-nowrap">
                                                  <span className="text-slate-500">¥{item.tierDetail.tier1Profit.toFixed(2)} × 10%</span>
                                                  <span className="font-bold text-emerald-700 dark:text-emerald-300">= ¥{item.tierDetail.tier1Fee.toFixed(2)}</span>
                                                </div>
                                              </div>

                                              {/* Tier 2 mini card */}
                                              <div className="p-1.5 rounded bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 space-y-0.5">
                                                <div className="flex items-center justify-between font-sans text-amber-700 dark:text-amber-400 font-medium whitespace-nowrap">
                                                  <span>阶梯② (&gt;5% 超额利润)</span>
                                                  <span className="font-mono text-[10px]">计提 50%</span>
                                                </div>
                                                <div className="flex items-center justify-between font-mono text-[10.5px] whitespace-nowrap">
                                                  <span className="text-slate-500">
                                                    {item.tierDetail.tier2Profit > 0 ? `¥${item.tierDetail.tier2Profit.toFixed(2)} × 50%` : '未超门槛'}
                                                  </span>
                                                  <span className="font-bold text-amber-700 dark:text-amber-300">
                                                    = ¥{item.tierDetail.tier2Fee.toFixed(2)}
                                                  </span>
                                                </div>
                                              </div>

                                              {/* Deduct Total */}
                                              <div className="flex justify-between items-center text-indigo-700 dark:text-indigo-300 font-semibold pt-1 border-t border-indigo-200/60 dark:border-indigo-900/60 font-mono text-[11px] whitespace-nowrap">
                                                <span className="font-sans">扣除提成合计:</span>
                                                <span className="font-bold">-¥{item.feeAmount.toFixed(2)}</span>
                                              </div>

                                              {/* Individual Tier Proportions Bar */}
                                              {item.grossProfitShare > 0 && (
                                                <div className="pt-0.5">
                                                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex">
                                                    <div
                                                      style={{
                                                        width: `${Math.min(
                                                          100,
                                                          (item.tierDetail.tier1Profit / item.grossProfitShare) * 100
                                                        )}%`,
                                                      }}
                                                      className="bg-emerald-500 h-full"
                                                    />
                                                    <div
                                                      style={{
                                                        width: `${Math.max(
                                                          0,
                                                          (item.tierDetail.tier2Profit / item.grossProfitShare) * 100
                                                        )}%`,
                                                      }}
                                                      className="bg-amber-500 h-full"
                                                    />
                                                  </div>
                                                  <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 font-sans">
                                                    <span className="text-emerald-600 dark:text-emerald-400">■ 5%以内基准</span>
                                                    <span className="text-amber-600 dark:text-amber-400">■ 超出5%超额</span>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="text-[11px] font-mono">提成: -¥{item.feeAmount.toFixed(2)}</div>
                                          )}
                                        </div>

                                        {/* Step 3 */}
                                        <div
                                          className={`p-2.5 rounded-lg border space-y-1.5 ${
                                            cardStyle === 'light'
                                              ? 'bg-emerald-50/40 border-emerald-200/60'
                                              : 'bg-emerald-950/20 border-emerald-900/40'
                                          }`}
                                        >
                                          <div className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 font-sans text-[11px] whitespace-nowrap">
                                            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[9px] shrink-0">
                                              3
                                            </span>
                                            <span>实发分红与底仓留存</span>
                                          </div>
                                          <div className="space-y-1 text-[11px] text-slate-600 dark:text-zinc-400">
                                            <div className="flex justify-between items-center font-semibold text-emerald-600 dark:text-emerald-400">
                                              <span>实发到手分红:</span>
                                              <span className="font-bold font-mono text-sm">+¥{item.netDividend.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                                              <span>到手净收益率:</span>
                                              <span className="font-mono font-bold">+{((item.netDividendRate || 0) * 100).toFixed(2)}%</span>
                                            </div>
                                            <p className="text-[9.5px] text-slate-400 font-sans">
                                              (毛利 ¥{item.grossProfitShare.toFixed(2)} - 提成 ¥{item.feeAmount.toFixed(2)})
                                            </p>
                                            <div className="flex justify-between items-center text-slate-700 dark:text-zinc-200 pt-1 border-t border-emerald-200/60 dark:border-emerald-900/60 font-semibold">
                                              <span>留存底仓本金:</span>
                                              <span className="font-mono font-bold">¥{item.remainingPrincipal.toLocaleString('zh-CN')}</span>
                                            </div>
                                            <p className="text-[9.5px] text-emerald-600/90 dark:text-emerald-400/80 font-sans">
                                              ✅ 原始本金完整保留，不因分红扣除
                                            </p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Calculation Summary Footer */}
                                      {item.tierDetail?.calculationSummary && (
                                        <div className="text-[10px] sm:text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-950 text-slate-600 dark:text-zinc-400 font-mono flex items-start sm:items-center gap-1.5 border border-slate-200/50 dark:border-zinc-800">
                                          <span className="text-slate-400 shrink-0 font-bold font-sans">推导公式:</span>
                                          <span className="text-slate-800 dark:text-zinc-200 leading-tight">{item.tierDetail.calculationSummary}</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>

                      {/* Table Totals Footer (合计汇总行) */}
                      <tfoot className="border-t-2 border-slate-300 dark:border-zinc-700 bg-slate-50/90 dark:bg-zinc-900/90 font-mono text-xs font-semibold">
                        <tr>
                          <td className="py-2.5 pl-2 pr-1 text-center"></td>
                          <td className="py-2.5 px-3 text-slate-800 dark:text-zinc-200 font-sans font-bold whitespace-nowrap">
                            合计 ({plan.items.length} 人)
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-800 dark:text-zinc-200 whitespace-nowrap">
                            ¥{plan.totalPoolPrincipal.toLocaleString('zh-CN')}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-500 whitespace-nowrap">
                            100.00%
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-800 dark:text-zinc-200 font-bold whitespace-nowrap">
                            ¥{plan.totalGrossProfit.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-2 text-right text-rose-600 dark:text-rose-400 whitespace-nowrap">
                            -¥{plan.totalManagerFee.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/5 whitespace-nowrap">
                            ¥{plan.totalNetDividend.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-800 dark:text-zinc-200 font-semibold whitespace-nowrap">
                            ¥{plan.totalPoolPrincipal.toLocaleString('zh-CN')}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ======================================================== */}
            {/* MODE B: SINGLE PARTNER BILL (针对个人的专属结算凭单) */}
            {/* ======================================================== */}
            {viewMode === 'single' && currentSingleItem && (
              <div className="space-y-4">
                {/* 1. Header Banner */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-dashed border-slate-200 dark:border-zinc-800">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
                        <Award className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-bold tracking-wider uppercase text-blue-600 dark:text-blue-400">
                        Individual Dividend Statement
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                      <span>合伙投资收益分红结算对账单</span>
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-slate-600 dark:text-zinc-300">
                      <span className="font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                        {currentSingleMeta?.color && (
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: currentSingleMeta.color }}
                          />
                        )}
                        <span>合伙投资人: <strong>{currentPartnerDisplayName}</strong></span>
                      </span>
                      <span>•</span>
                      <span>账户: <span className="font-mono">{accountAlias}</span></span>
                      <span>•</span>
                      <span>结算年度: <strong>{plan.year} 自然年</strong></span>
                      <span>•</span>
                      <span>基准日: <span className="font-mono">{settleDate}</span></span>
                    </div>
                  </div>

                  {/* Top Right Certificate Stamp */}
                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>合伙结算凭单</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 mt-1">
                      CERT-{verifyStamp}
                    </div>
                  </div>
                </div>

                {/* 2. Key Metrics Grid for Single Partner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  {/* Principal */}
                  <div
                    className={`p-3.5 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-white/90 border-slate-200/90 shadow-2xs'
                        : 'bg-zinc-800/60 border-zinc-700/60'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                      净出资本金 (成本)
                    </div>
                    <div className="text-lg sm:text-xl font-mono font-black mt-1 text-slate-900 dark:text-zinc-100">
                      ¥{currentSingleItem.netPrincipal.toLocaleString('zh-CN')}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      资金池占比 {(currentSingleItem.shareRatio * 100).toFixed(2)}%
                    </div>
                  </div>

                  {/* Gross Profit Share */}
                  <div
                    className={`p-3.5 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-white/90 border-slate-200/90 shadow-2xs'
                        : 'bg-zinc-800/60 border-zinc-700/60'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                      <span>分配毛收益</span>
                      <TrendingUp className="w-3 h-3 text-blue-500" />
                    </div>
                    <div className="text-lg sm:text-xl font-mono font-black mt-1 text-blue-600 dark:text-blue-400">
                      +{formatMoney(currentSingleItem.grossProfitShare)}
                    </div>
                    <div className="text-[10px] font-medium text-blue-600/90 dark:text-blue-400/90 mt-0.5">
                      毛收益率 +{((currentSingleItem.profitRate || 0) * 100).toFixed(2)}%
                    </div>
                  </div>

                  {/* Performance Fee Deducted */}
                  <div
                    className={`p-3.5 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-white/90 border-slate-200/90 shadow-2xs'
                        : 'bg-zinc-800/60 border-zinc-700/60'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                      手续费提成扣除
                    </div>
                    <div className="text-lg sm:text-xl font-mono font-black mt-1 text-rose-600 dark:text-rose-400">
                      -¥{currentSingleItem.feeAmount.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      综合费率 {(currentSingleItem.feeRate * 100).toFixed(1)}% (不收管理费)
                    </div>
                  </div>

                  {/* Final Net Dividend Payout (Highlighted) */}
                  <div
                    className={`p-3.5 rounded-xl border ${
                      cardStyle === 'light'
                        ? 'bg-emerald-50 border-emerald-300 shadow-xs text-emerald-950 ring-2 ring-emerald-500/30'
                        : 'bg-emerald-950/40 border-emerald-800 text-emerald-100 ring-2 ring-emerald-500/20'
                    }`}
                  >
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                      <span>★ 实发到手分红 ★</span>
                      <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-xl sm:text-2xl font-mono font-black mt-1 text-emerald-600 dark:text-emerald-400">
                      ¥{currentSingleItem.netDividend.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                      到手净收益率 +{((currentSingleItem.netDividendRate || 0) * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* 3. Detailed Step-by-Step Calculation Breakdown Card */}
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    cardStyle === 'light'
                      ? 'bg-white border-slate-200/90 shadow-2xs'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-2">
                    <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-slate-800 dark:text-zinc-200">
                      <Calculator className="w-4 h-4 text-blue-500" />
                      <span>分红收益与阶梯手续费推导详情</span>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-medium">
                      {plan.feeMode === 'progressive' ? '超额累进制（5%以内10%，超出50%）' : '指定提成制'}
                    </span>
                  </div>

                  {/* 3 Steps Detailed Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {/* Step 1 */}
                    <div
                      className={`p-3 rounded-xl border space-y-1.5 ${
                        cardStyle === 'light'
                          ? 'bg-slate-50/70 border-slate-200/80'
                          : 'bg-zinc-800/40 border-zinc-800'
                      }`}
                    >
                      <div className="text-slate-800 dark:text-zinc-200 font-bold flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white inline-flex items-center justify-center text-[10px] shrink-0">
                          1
                        </span>
                        <span>基础出资与毛利分配</span>
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-zinc-400 font-mono text-[11px]">
                        <div className="flex justify-between items-center whitespace-nowrap">
                          <span>净出资本金:</span>
                          <span className="font-semibold text-slate-800 dark:text-zinc-200">¥{currentSingleItem.netPrincipal.toLocaleString('zh-CN')}</span>
                        </div>
                        <div className="flex justify-between items-center whitespace-nowrap">
                          <span>资金池占比:</span>
                          <span className="font-semibold">{(currentSingleItem.shareRatio * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center whitespace-nowrap">
                          <span>分配毛收益:</span>
                          <span className="font-bold text-slate-900 dark:text-zinc-100">¥{currentSingleItem.grossProfitShare.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
                          <span>毛收益率:</span>
                          <span>+{((currentSingleItem.profitRate || 0) * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-200/60 dark:border-zinc-800 whitespace-nowrap">
                          <span>5% 门槛收益额:</span>
                          <span>¥{(currentSingleItem.tierDetail?.hurdleProfitThreshold || currentSingleItem.netPrincipal * 0.05).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div
                      className={`p-3 rounded-xl border space-y-1.5 ${
                        cardStyle === 'light'
                          ? 'bg-indigo-50/40 border-indigo-200/60'
                          : 'bg-indigo-950/20 border-indigo-900/40'
                      }`}
                    >
                      <div className="text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-between text-xs whitespace-nowrap gap-1">
                        <div className="flex items-center gap-1.5 font-sans shrink-0">
                          <span className="w-4 h-4 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px] shrink-0">
                            2
                          </span>
                          <span className="whitespace-nowrap">手续费提成测算</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100/70 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium whitespace-nowrap shrink-0">
                          综合 {(currentSingleItem.feeRate * 100).toFixed(1)}%
                        </span>
                      </div>

                      {currentSingleItem.isReentered ? (
                        <div className="text-xs text-rose-600 dark:text-rose-400 space-y-1">
                          <div className="font-medium">规则4惩罚: 当年曾离场出金并重入，全额按 50% 扣除手续费</div>
                          <div className="font-bold font-mono text-sm">¥{currentSingleItem.grossProfitShare.toFixed(2)} × 50% = -¥{currentSingleItem.feeAmount.toFixed(2)}</div>
                        </div>
                      ) : currentSingleItem.tierDetail ? (
                        <div className="space-y-1.5 text-slate-600 dark:text-zinc-400">
                          {/* Tier 1 Box */}
                          <div className="p-1.5 rounded-lg bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 space-y-0.5">
                            <div className="flex items-center justify-between font-sans text-emerald-700 dark:text-emerald-400 font-medium text-[11px] whitespace-nowrap">
                              <span>阶梯① (≤5% 门槛内基准毛利)</span>
                              <span className="font-mono">计提 10%</span>
                            </div>
                            <div className="flex items-center justify-between font-mono text-xs whitespace-nowrap">
                              <span className="text-slate-500">¥{currentSingleItem.tierDetail.tier1Profit.toFixed(2)} × 10%</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-300">= ¥{currentSingleItem.tierDetail.tier1Fee.toFixed(2)}</span>
                            </div>
                          </div>

                          {/* Tier 2 Box */}
                          <div className="p-1.5 rounded-lg bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 space-y-0.5">
                            <div className="flex items-center justify-between font-sans text-amber-700 dark:text-amber-400 font-medium text-[11px] whitespace-nowrap">
                              <span>阶梯② (&gt;5% 超额利润部分)</span>
                              <span className="font-mono">计提 50%</span>
                            </div>
                            <div className="flex items-center justify-between font-mono text-xs whitespace-nowrap">
                              <span className="text-slate-500">
                                {currentSingleItem.tierDetail.tier2Profit > 0
                                  ? `¥${currentSingleItem.tierDetail.tier2Profit.toFixed(2)} × 50%`
                                  : '未超 5% 门槛 (超额利润为 0)'}
                              </span>
                              <span className="font-bold text-amber-700 dark:text-amber-300">
                                = ¥{currentSingleItem.tierDetail.tier2Fee.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Fee Deduct Total */}
                          <div className="flex justify-between items-center text-indigo-700 dark:text-indigo-300 font-bold pt-1 border-t border-indigo-200/60 dark:border-indigo-900/60 font-mono whitespace-nowrap">
                            <span className="font-sans">扣除提成合计:</span>
                            <span>-¥{currentSingleItem.feeAmount.toFixed(2)}</span>
                          </div>

                          {/* Visual Tier Proportions Bar */}
                          {currentSingleItem.grossProfitShare > 0 && (
                            <div className="pt-0.5">
                              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex">
                                <div
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (currentSingleItem.tierDetail.tier1Profit / currentSingleItem.grossProfitShare) * 100
                                    )}%`,
                                  }}
                                  className="bg-emerald-500 h-full"
                                />
                                <div
                                  style={{
                                    width: `${Math.max(
                                      0,
                                      (currentSingleItem.tierDetail.tier2Profit / currentSingleItem.grossProfitShare) * 100
                                    )}%`,
                                  }}
                                  className="bg-amber-500 h-full"
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 font-sans">
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">■ 5%以内(10%)</span>
                                <span className="text-amber-600 dark:text-amber-400 font-medium">■ 超出5%(50%)</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="font-mono text-sm">提成: -¥{currentSingleItem.feeAmount.toFixed(2)}</div>
                      )}
                    </div>

                    {/* Step 3 */}
                    <div
                      className={`p-3 rounded-xl border space-y-1.5 ${
                        cardStyle === 'light'
                          ? 'bg-emerald-50/40 border-emerald-200/60'
                          : 'bg-emerald-950/20 border-emerald-900/40'
                      }`}
                    >
                      <div className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1.5 whitespace-nowrap">
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[10px] shrink-0">
                          3
                        </span>
                        <span>实发分红与底仓留存</span>
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-zinc-400 text-xs">
                        <div className="flex justify-between items-center font-bold text-emerald-600 dark:text-emerald-400">
                          <span>实发到手分红:</span>
                          <span className="font-mono text-base">+¥{currentSingleItem.netDividend.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                          <span>到手净收益率:</span>
                          <span className="font-mono font-bold">+{((currentSingleItem.netDividendRate || 0) * 100).toFixed(2)}%</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-sans">
                          (分配毛利 ¥{currentSingleItem.grossProfitShare.toFixed(2)} - 提成 ¥{currentSingleItem.feeAmount.toFixed(2)})
                        </p>
                        <div className="flex justify-between items-center text-slate-800 dark:text-zinc-100 pt-1.5 border-t border-emerald-200/60 dark:border-emerald-900/60 font-bold">
                          <span>分红后留存底仓:</span>
                          <span className="font-mono text-sm">¥{currentSingleItem.remainingPrincipal.toLocaleString('zh-CN')}</span>
                        </div>
                        <p className="text-[10.5px] text-emerald-600/90 dark:text-emerald-400/80 font-sans">
                          ✅ 原始出资本金完整保留，不因分红扣除底仓
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary Formula Bar */}
                  {currentSingleItem.tierDetail?.calculationSummary && (
                    <div className="text-xs px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 font-mono flex items-start gap-2 border border-slate-200/60 dark:border-zinc-800">
                      <span className="text-slate-400 shrink-0 font-bold font-sans">推导公式:</span>
                      <span className="leading-relaxed">{currentSingleItem.tierDetail.calculationSummary}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Cash Flow Registration Status */}
            <div
              className={`mt-3.5 p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                cardStyle === 'light'
                  ? 'bg-blue-50/60 border-blue-200/80 text-blue-900'
                  : 'bg-blue-950/30 border-blue-800/60 text-blue-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  <strong>分红出金流水状态：</strong>
                  {isFlowsRecorded
                    ? '已成功批量生成并录入账户流水，出金发放凭据已建立'
                    : '已完成分红清算测算，与账户系统出金流水完全对齐'}
                </span>
              </div>
              <span className="font-mono text-[11px] opacity-75 shrink-0 hidden sm:inline">
                {viewMode === 'single' ? '单人专属对账凭单' : `共 ${plan.items.length} 笔发放`}
              </span>
            </div>

            {/* 5. Footer & Core Rules Reminder */}
            <div className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-zinc-800 text-[10px] text-slate-500 dark:text-zinc-400 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-zinc-300">
                <Shield className="w-3.5 h-3.5 text-blue-500" />
                <span>合伙投资约定履约执行原则：</span>
              </div>
              <p className="leading-relaxed pl-5">
                ① 盈利后均分准入 · ② 3日内仓位披露 · ③ 离场后再入金合规约束 · ④ 自然年元旦后强制分红结算。
                分红发放完毕后，各位合伙人的原始底仓本金维持完整保留，确保账目清晰透明！
              </p>
              <div className="flex items-center justify-between pt-1.5 text-[9px] text-slate-400 dark:text-zinc-500 font-mono">
                <span>生成时间: {new Date().toLocaleString('zh-CN')}</span>
                <span>SECURITY VERIFICATION: {verifyStamp}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-900 shrink-0 z-10">
          <div className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {viewMode === 'single'
                ? `当前为【${currentPartnerDisplayName}】个人专属结算单，支持微信直接粘贴或导出 PDF`
                : '提示：生成的截图直接复制后，可以在微信、企业微信聊天框直接 Ctrl+V 发送'}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Download PDF Button */}
            <button
              type="button"
              disabled={isCapturing || isGeneratingPdf}
              onClick={handleExportPdf}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors shadow-2xs"
            >
              <FileText className="w-4 h-4 text-rose-500" />
              <span>{isGeneratingPdf ? '正在导出...' : '导出 PDF'}</span>
            </button>

            {/* Download PNG Button */}
            <button
              type="button"
              disabled={isCapturing || isGeneratingPdf}
              onClick={handleDownloadImage}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4" />
              <span>保存图片</span>
            </button>

            {/* Copy Image Button */}
            <button
              type="button"
              disabled={isCapturing || isGeneratingPdf}
              onClick={handleCopyImage}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors shadow-sm"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>已复制到剪贴板！</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{isCapturing ? '正在生成...' : '一键复制图片 (微信直接贴)'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
