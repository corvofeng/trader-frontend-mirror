import { Theme, themes } from '../../lib/theme';

export const renderMarkdown = (raw: string, theme: Theme) => {
  if (typeof raw !== 'string') return '';
  const content = raw.trim().replace(/\n{3,}/g, '\n\n');
  const lines = content.split(/\r?\n/);
  let html = '';
  let paragraph = '';
  let inList = false;
  let listTag: 'ul' | 'ol' | null = null;
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const parseTableRow = (line: string) => {
    const trimmed = line.trim();
    let parts = trimmed.split('|');
    if (trimmed.startsWith('|')) parts = parts.slice(1);
    if (trimmed.endsWith('|')) parts = parts.slice(0, -1);
    return parts.map((cell) => cell.trim());
  };

  const isTableSeparatorLine = (line: string) => {
    const trimmed = line.trim();
    return trimmed.includes('|') && /^[\s|:-]+$/.test(trimmed) && trimmed.includes('-');
  };

  const formatText = (text: string) => {
    const buttonClass = `inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium ${themes[theme].primary}`;
    const linkClass = 'underline text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">$1</code>')
      .replace(/\[\[button:([^\]|]+)\|notice:([0-9a-fA-F-]{36})\]\]/g, (_match, label: string, uuid: string) => {
        return `<button type="button" data-notice-uuid="${escapeHtml(uuid)}" class="${buttonClass}">${escapeHtml(label)}</button>`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
        const safeLabel = escapeHtml(label);
        const rawHref = href.trim();
        const noticeHref = rawHref.replace(/^notice:\/\//, 'notice:');
        if (noticeHref.startsWith('notice:')) {
          const uuid = noticeHref.replace(/^notice:/, '').trim();
          if (/^[0-9a-fA-F-]{36}$/.test(uuid)) {
            return `<button type="button" data-notice-uuid="${escapeHtml(uuid)}" class="${buttonClass}">${safeLabel}</button>`;
          }
        }
        return `<a href="${escapeHtml(rawHref)}" target="_blank" rel="noreferrer" class="${linkClass}">${safeLabel}</a>`;
      });
  };

  const flushParagraph = () => {
    const text = paragraph.trim();
    if (text) {
      html += `<p class="mb-2 leading-relaxed text-sm ${themes[theme].text}">${formatText(text)}</p>`;
    }
    paragraph = '';
  };

  const closeList = () => {
    if (inList && listTag) {
      html += `</${listTag}>`;
      inList = false;
      listTag = null;
    }
  };

  const closeTable = () => {
    if (!inTable) return;

    html += `<div class="overflow-x-auto mb-4 border rounded-lg ${themes[theme].border}">`;
    html += `<table class="min-w-full table-auto divide-y ${themes[theme].border}">`;

    if (tableHeader.length > 0) {
      html += `<thead class="bg-gray-50 dark:bg-gray-800"><tr>`;
      tableHeader.forEach((cell) => {
        html += `<th scope="col" class="px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-70 uppercase tracking-wider break-words">${formatText(cell.trim())}</th>`;
      });
      html += `</tr></thead>`;
    }

    html += `<tbody class="divide-y ${themes[theme].border} bg-white dark:bg-gray-900">`;
    tableRows.forEach((row) => {
      html += `<tr class="odd:bg-gray-50 dark:odd:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50">`;
      row.forEach((cell) => {
        html += `<td class="px-4 py-2 text-sm ${themes[theme].text} break-words align-top">${formatText(cell.trim())}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;

    inTable = false;
    tableHeader = [];
    tableRows = [];
  };

  const closeCodeBlock = () => {
    if (!inCodeBlock) return;
    const body = codeBlockLines.join('\n');
    html += `<pre class="overflow-x-auto mb-4 border rounded-lg ${themes[theme].border} bg-gray-50 dark:bg-gray-900 p-3"><code class="block whitespace-pre font-mono text-xs ${themes[theme].text}">${escapeHtml(body)}</code></pre>`;
    inCodeBlock = false;
    codeBlockLines = [];
  };

  const isAsciiTableBorder = (line: string) => /^\+[+-]+(\+[+-]+)+\+$/.test(line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      closeList();
      closeTable();
      if (inCodeBlock) {
        closeCodeBlock();
      } else {
        inCodeBlock = true;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (isAsciiTableBorder(trimmed) && lines[i + 1]?.trim().startsWith('|')) {
      flushParagraph();
      closeList();
      closeTable();

      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        const candidate = lines[j];
        const candidateTrimmed = candidate.trim();
        if (candidateTrimmed === '') break;
        if (candidateTrimmed.startsWith('|') || isAsciiTableBorder(candidateTrimmed)) {
          tableLines.push(candidate);
          j += 1;
          continue;
        }
        break;
      }

      html += `<pre class="overflow-x-auto mb-4 border rounded-lg ${themes[theme].border} bg-gray-50 dark:bg-gray-900 p-3"><code class="block whitespace-pre font-mono text-xs ${themes[theme].text}">${escapeHtml(tableLines.join('\n'))}</code></pre>`;
      i = j - 1;
      continue;
    }

    if (inTable) {
      if (trimmed === '') {
        closeTable();
        continue;
      }
      if (isTableSeparatorLine(trimmed)) {
        continue;
      }
      if (!trimmed.includes('|')) {
        closeTable();
        i -= 1;
        continue;
      }
      const cells = parseTableRow(trimmed);
      const normalized =
        tableHeader.length > 0 && cells.length < tableHeader.length
          ? [...cells, ...new Array(tableHeader.length - cells.length).fill('')]
          : cells;
      tableRows.push(normalized);
      continue;
    }

    const nextLine = lines[i + 1]?.trim();
    const canStartTable = trimmed.includes('|') && !!nextLine && isTableSeparatorLine(nextLine);
    if (canStartTable) {
      flushParagraph();
      closeList();
      closeTable();

      inTable = true;
      tableHeader = parseTableRow(trimmed);
      tableRows = [];
      i += 1;
      continue;
    }

    // Horizontal Rule
    if (/^(-{3,}|\*\*\*)$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html += `<hr class="my-4 border-t ${themes[theme].border}" />`;
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const sizeClass = level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : 'text-base';
      html += `<h${level} class="${sizeClass} font-bold mt-4 mb-2 ${themes[theme].text}">${formatText(text)}</h${level}>`;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushParagraph();
      closeList();
      const text = trimmed.substring(1).trim();
      html += `<blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-2 text-sm ${themes[theme].text} opacity-80">${formatText(text)}</blockquote>`;
      continue;
    }

    // Lists
    const unorderedMatch = /^\s{0,4}[-*]\s+(.*)$/.exec(line);
    const orderedMatch = /^\s{0,4}\d+\.\s+(.*)$/.exec(line);

    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      
      const isOrdered = !!orderedMatch;
      const tag: 'ul' | 'ol' = isOrdered ? 'ol' : 'ul';
      const rawItem = (unorderedMatch ? unorderedMatch[1] : orderedMatch![1]) || '';

      if (!inList || listTag !== tag) {
        closeList();
        const listClass = isOrdered ? 'list-decimal' : 'list-disc';
        html += `<${tag} class="ml-5 mb-2 ${listClass} space-y-1 ${themes[theme].text}">`;
        inList = true;
        listTag = tag;
      }

      const indentClass = /^\s{2,}/.test(line) ? 'ml-4' : '';
      html += `<li class="text-sm pl-1 ${indentClass}">${formatText(rawItem)}</li>`;
      continue;
    }

    // Empty line
    if (trimmed === '') {
      flushParagraph();
      closeList();
      continue;
    }

    // Normal text (merge into paragraph)
    if (inList) {
       closeList();
    }
    paragraph += (paragraph ? ' ' : '') + line;
  }

  flushParagraph();
  closeList();
  closeTable();
  closeCodeBlock();
  return html;
};
