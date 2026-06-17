import { HelpCircle } from 'lucide-react';
import type { Theme } from '../../../lib/theme';
import { themes } from '../../../lib/theme';

interface InfoTooltipProps {
  theme: Theme;
  content: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function InfoTooltip({
  theme,
  content,
  align = 'center',
  className = '',
}: InfoTooltipProps) {
  const alignmentClass = align === 'left'
    ? 'left-0'
    : align === 'right'
    ? 'right-0'
    : 'left-1/2 -translate-x-1/2';

  const tooltipThemeClass = theme === 'dark'
    ? 'bg-gray-950/95 text-gray-100 border-gray-700'
    : theme === 'blue'
    ? 'bg-blue-950/95 text-white border-blue-300/30'
    : 'bg-gray-900/95 text-white border-gray-800/30';

  return (
    <span className={`group relative inline-flex items-center align-middle ${className}`}>
      <span
        tabIndex={0}
        role="img"
        aria-label={content}
        className={`inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full ${themes[theme].secondary} opacity-75 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-30 mb-2 w-56 rounded-lg border px-3 py-2 text-left text-xs leading-5 shadow-lg transition duration-150 ease-out whitespace-pre-line opacity-0 invisible group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${alignmentClass} ${tooltipThemeClass}`}
      >
        {content}
      </span>
    </span>
  );
}
