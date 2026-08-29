import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Theme, themes } from '../../../lib/theme';
import { InteractiveMarkdownTable } from './InteractiveMarkdownTable';

export interface MarkdownViewerProps {
  content: string;
  theme: Theme;
  className?: string;
}

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'table'; headers: string[]; rows: string[]; caption?: string }
  | { type: 'details'; summary: string; children: MarkdownBlock[]; defaultOpen?: boolean }
  | { type: 'code'; language?: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string };

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  let parts = trimmed.split('|');
  if (trimmed.startsWith('|')) parts = parts.slice(1);
  if (trimmed.endsWith('|')) parts = parts.slice(0, -1);
  return parts.map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && /^[\s|:-]+$/.test(trimmed) && trimmed.includes('-');
}

function parseMarkdownBlocks(rawMarkdown: string): MarkdownBlock[] {
  if (typeof rawMarkdown !== 'string') return [];
  const lines = rawMarkdown.replace(/\r\n/g, '\n').split('\n');

  const parseBlocksRange = (startLine: number, endLine: number): MarkdownBlock[] => {
    const subBlocks: MarkdownBlock[] = [];
    let idx = startLine;

    while (idx < endLine) {
      const line = lines[idx];
      const trimmed = line.trim();

      // Empty line
      if (trimmed === '') {
        idx++;
        continue;
      }

      // Details tag start
      if (trimmed.startsWith('<details>')) {
        let detailsSummary = '详细信息';
        let j = idx + 1;
        // Check if next line has <summary>
        if (j < endLine && lines[j].trim().startsWith('<summary>')) {
          const sumLine = lines[j].trim();
          detailsSummary = sumLine.replace(/<\/?summary>/g, '').trim();
          j++;
        }

        // Find closing </details>
        const detailsStart = j;
        while (j < endLine && !lines[j].trim().includes('</details>')) {
          j++;
        }

        const innerBlocks = parseBlocksRange(detailsStart, j);
        subBlocks.push({
          type: 'details',
          summary: detailsSummary,
          children: innerBlocks,
        });

        idx = j + 1;
        continue;
      }

      // Table check
      const nextLine = idx + 1 < endLine ? lines[idx + 1].trim() : '';
      if (trimmed.includes('|') && nextLine && isTableSeparatorLine(nextLine)) {
        const headers = parseTableRow(trimmed);
        const rows: string[][] = [];
        let j = idx + 2;

        while (j < endLine) {
          const rowLine = lines[j].trim();
          if (rowLine === '' || !rowLine.includes('|') || isTableSeparatorLine(rowLine)) {
            if (rowLine !== '' && isTableSeparatorLine(rowLine)) {
              j++;
              continue;
            }
            break;
          }
          const cells = parseTableRow(rowLine);
          const normalized =
            headers.length > 0 && cells.length < headers.length
              ? [...cells, ...new Array(headers.length - cells.length).fill('')]
              : cells;
          rows.push(normalized);
          j++;
        }

        subBlocks.push({
          type: 'table',
          headers,
          rows: rows as any,
        });
        idx = j;
        continue;
      }

      // Code block
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim();
        const codeLines: string[] = [];
        let j = idx + 1;
        while (j < endLine && !lines[j].trim().startsWith('```')) {
          codeLines.push(lines[j]);
          j++;
        }
        subBlocks.push({
          type: 'code',
          language: lang,
          code: codeLines.join('\n'),
        });
        idx = j + 1;
        continue;
      }

      // Heading
      const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
      if (headingMatch) {
        subBlocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
        });
        idx++;
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        subBlocks.push({ type: 'hr' });
        idx++;
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('> ')) {
        const quoteLines: string[] = [trimmed.slice(2).trim()];
        let j = idx + 1;
        while (j < endLine && lines[j].trim().startsWith('> ')) {
          quoteLines.push(lines[j].trim().slice(2).trim());
          j++;
        }
        subBlocks.push({
          type: 'blockquote',
          text: quoteLines.join(' '),
        });
        idx = j;
        continue;
      }

      // List item
      const unorderedMatch = /^\s*[-*]\s+(.*)$/.exec(line);
      const orderedMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (unorderedMatch || orderedMatch) {
        const isOrdered = !!orderedMatch;
        const items: string[] = [(unorderedMatch ? unorderedMatch[1] : orderedMatch![1]).trim()];
        let j = idx + 1;

        while (j < endLine) {
          const nextL = lines[j];
          const nextTrim = nextL.trim();
          if (!nextTrim) break;
          const matchUnordered = /^\s*[-*]\s+(.*)$/.exec(nextL);
          const matchOrdered = /^\s*\d+\.\s+(.*)$/.exec(nextL);

          if (isOrdered && matchOrdered) {
            items.push(matchOrdered[1].trim());
            j++;
          } else if (!isOrdered && matchUnordered) {
            items.push(matchUnordered[1].trim());
            j++;
          } else {
            break;
          }
        }

        subBlocks.push({
          type: 'list',
          ordered: isOrdered,
          items,
        });
        idx = j;
        continue;
      }

      // Paragraph
      const paraLines: string[] = [trimmed];
      let j = idx + 1;
      while (j < endLine) {
        const nextL = lines[j];
        const nextTrim = nextL.trim();
        if (
          !nextTrim ||
          nextTrim.startsWith('#') ||
          nextTrim.startsWith('```') ||
          nextTrim.startsWith('<details') ||
          nextTrim.startsWith('</details>') ||
          nextTrim.startsWith('> ') ||
          /^\s*[-*]\s+/.test(nextL) ||
          /^\s*\d+\.\s+/.test(nextL) ||
          /^(-{3,}|\*{3,})$/.test(nextTrim) ||
          (nextTrim.includes('|') && j + 1 < endLine && isTableSeparatorLine(lines[j + 1]))
        ) {
          break;
        }
        paraLines.push(nextTrim);
        j++;
      }

      subBlocks.push({
        type: 'paragraph',
        text: paraLines.join(' '),
      });
      idx = j;
    }

    return subBlocks;
  };

  return parseBlocksRange(0, lines.length);
}

function formatInlineText(text: string, theme: Theme): React.ReactNode {
  // Format tokens like **bold**, `code`, [link](url), [[button:label|notice:id]]
  if (!text) return null;

  // Split by markdown inline syntax
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|\[\[button:[^\]|]+\|notice:[0-9a-fA-F-]+\]\]|\[.*?\]\(.*?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-slate-900 dark:text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 px-1.5 py-0.5 rounded text-xs font-mono border border-slate-200/60 dark:border-zinc-700/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[[button:')) {
      const btnMatch = token.match(/\[\[button:([^\]|]+)\|notice:([0-9a-fA-F-]+)\]\]/);
      if (btnMatch) {
        parts.push(
          <button
            key={match.index}
            type="button"
            data-notice-uuid={btnMatch[2]}
            className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-medium ${themes[theme].primary}`}
          >
            {btnMatch[1]}
          </button>
        );
      }
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a
            key={match.index}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            {linkMatch[1]}
          </a>
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function CollapsibleDetailsCard({
  summary,
  children,
  theme,
}: {
  summary: string;
  children: MarkdownBlock[];
  theme: Theme;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="my-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/60 shadow-xs overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-slate-50/80 hover:bg-slate-100/80 dark:bg-zinc-800/40 dark:hover:bg-zinc-800/80 flex items-center justify-between text-left transition-colors border-b border-transparent data-[open=true]:border-slate-200 dark:data-[open=true]:border-zinc-800 select-none"
        data-open={isOpen}
      >
        <span className="font-semibold text-sm text-slate-800 dark:text-zinc-200 flex items-center gap-2">
          {summary}
        </span>
        <span className="text-slate-400 dark:text-zinc-500">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {isOpen && (
        <div className="p-4 space-y-3 bg-white dark:bg-zinc-900/20">
          <RenderMarkdownBlocks blocks={children} theme={theme} />
        </div>
      )}
    </div>
  );
}

function RenderMarkdownBlocks({
  blocks,
  theme,
}: {
  blocks: MarkdownBlock[];
  theme: Theme;
}) {
  return (
    <>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading': {
            const level = block.level;
            const text = block.text;
            if (level === 1) {
              return (
                <h1 key={idx} className={`text-xl sm:text-2xl font-bold mt-5 mb-3 ${themes[theme].text} border-b border-slate-200 dark:border-zinc-800 pb-2`}>
                  {formatInlineText(text, theme)}
                </h1>
              );
            }
            if (level === 2) {
              return (
                <h2 key={idx} className={`text-lg sm:text-xl font-bold mt-4 mb-2 ${themes[theme].text} flex items-center gap-2`}>
                  {formatInlineText(text, theme)}
                </h2>
              );
            }
            if (level === 3) {
              return (
                <h3 key={idx} className={`text-base sm:text-lg font-semibold mt-3 mb-2 ${themes[theme].text}`}>
                  {formatInlineText(text, theme)}
                </h3>
              );
            }
            if (level === 4) {
              return (
                <h4 key={idx} className={`text-sm sm:text-base font-semibold mt-3 mb-1.5 ${themes[theme].text}`}>
                  {formatInlineText(text, theme)}
                </h4>
              );
            }
            return (
              <h5 key={idx} className={`text-xs sm:text-sm font-semibold mt-2 mb-1 ${themes[theme].text}`}>
                {formatInlineText(text, theme)}
              </h5>
            );
          }

          case 'table':
            return (
              <InteractiveMarkdownTable
                key={idx}
                headers={block.headers}
                rows={block.rows as any}
                theme={theme}
                caption={block.caption}
              />
            );

          case 'details':
            return (
              <CollapsibleDetailsCard
                key={idx}
                summary={block.summary}
                children={block.children}
                theme={theme}
              />
            );

          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            const listClass = block.ordered ? 'list-decimal' : 'list-disc';
            return (
              <Tag key={idx} className={`ml-5 my-2 space-y-1 ${listClass} ${themes[theme].text} text-xs sm:text-sm leading-relaxed`}>
                {block.items.map((it, iIdx) => (
                  <li key={iIdx} className="pl-1">
                    {formatInlineText(it, theme)}
                  </li>
                ))}
              </Tag>
            );
          }

          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className="border-l-4 border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/20 pl-3.5 py-1.5 my-2.5 italic text-xs sm:text-sm text-slate-700 dark:text-zinc-300 rounded-r-md"
              >
                {formatInlineText(block.text, theme)}
              </blockquote>
            );

          case 'code':
            return (
              <pre
                key={idx}
                className="overflow-x-auto my-3 p-3 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-mono text-slate-800 dark:text-zinc-200"
              >
                <code>{block.code}</code>
              </pre>
            );

          case 'hr':
            return <hr key={idx} className="my-4 border-t border-slate-200 dark:border-zinc-800" />;

          case 'paragraph':
            return (
              <p key={idx} className={`my-2 text-xs sm:text-sm leading-relaxed ${themes[theme].text}`}>
                {formatInlineText(block.text, theme)}
              </p>
            );

          default:
            return null;
        }
      })}
    </>
  );
}

export function MarkdownViewer({ content, theme, className = '' }: MarkdownViewerProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  if (!content || !content.trim()) {
    return <div className={`text-xs sm:text-sm ${themes[theme].text} opacity-60`}>暂无内容</div>;
  }

  return (
    <div className={`markdown-viewer space-y-1 ${className}`}>
      <RenderMarkdownBlocks blocks={blocks} theme={theme} />
    </div>
  );
}
