import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { Theme } from '../../theme';
import { WebMcpGuideModal, type WebMcpToolItem } from './WebMcpGuideModal';

interface WebMcpBadgeProps {
  theme: Theme;
  toolCount: number;
  isSupported: boolean;
  pageTitle?: string;
  customTools?: WebMcpToolItem[];
  isReady?: boolean;
}

export function WebMcpBadge({
  theme,
  toolCount,
  isSupported,
  pageTitle,
  customTools,
  isReady,
}: WebMcpBadgeProps) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!isSupported) return null;

  const isReadyEffective = isReady !== undefined ? isReady : toolCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="group inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
        title="点击查看 WebMCP 工具列表、在线测试与控制台复制用法"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isReadyEffective ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'
          }`}
        />
        <span className="font-semibold">
          {isReadyEffective ? `WebMCP (${toolCount})` : 'WebMCP (就绪中)'}
        </span>
        <span className="text-[10px] opacity-70 group-hover:opacity-100 underline decoration-indigo-400/50 underline-offset-2 ml-0.5 hidden sm:inline">
          查看用法
        </span>
        <HelpCircle className="w-3 h-3 opacity-60 group-hover:opacity-100" />
      </button>

      <WebMcpGuideModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        theme={theme}
        pageTitle={pageTitle}
        customTools={customTools}
        isReady={isReadyEffective}
        registeredCount={toolCount}
      />
    </>
  );
}
