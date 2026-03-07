import { Theme, themes } from '../../lib/theme';

export const renderMarkdown = (raw: string, theme: Theme) => {
  const content = raw.trim().replace(/\n{3,}/g, '\n\n');
  const lines = content.split(/\r?\n/);
  let html = '';
  let paragraph = '';
  let inList = false;
  let listTag: 'ul' | 'ol' | null = null;
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];

  const formatText = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">$1</code>');
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
    if (inTable) {
      html += `<div class="overflow-x-auto mb-4 border rounded-lg ${themes[theme].border}"><table class="min-w-full divide-y ${themes[theme].border}">`;
      
      // Header
      if (tableHeader.length > 0) {
        html += `<thead class="bg-gray-50 dark:bg-gray-800"><tr>`;
        tableHeader.forEach(cell => {
           html += `<th scope="col" class="px-4 py-3 text-left text-xs font-medium ${themes[theme].text} opacity-70 uppercase tracking-wider">${formatText(cell.trim())}</th>`;
        });
        html += `</tr></thead>`;
      }

      // Body
      html += `<tbody class="divide-y ${themes[theme].border} bg-white dark:bg-gray-900">`;
      tableRows.forEach(row => {
        html += `<tr>`;
        row.forEach(cell => {
          html += `<td class="px-4 py-2 text-sm ${themes[theme].text} whitespace-nowrap">${formatText(cell.trim())}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table></div>`;

      inTable = false;
      tableHeader = [];
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table detection
    const isTableLine = trimmed.startsWith('|') || (trimmed.includes('|') && trimmed.length > 2);
    
    if (isTableLine) {
       flushParagraph();
       closeList();

       // Check if it's a separator line (only dashes and pipes)
       const isSeparator = /^[\s|:-]+$/.test(trimmed) && trimmed.includes('-');

       if (isSeparator) {
          // If we encounter a separator but haven't started a table, 
          // it means the previous line was actually the header.
          // But our loop structure processes line by line.
          // We need to look ahead or handle state carefully.
          // Simplified: If we are not inTable, this line is useless unless we buffered the previous line as header?
          // Actually, standard markdown: Header \n Separator \n Rows
          
          // Let's change approach:
          // If current line looks like a separator:
          //   AND previous line looked like a table row (pipes)
          //   THEN start table, treat previous line as header.
          continue; 
       }

       // Parse cells
       const cells = trimmed.split('|').filter((c, idx, arr) => {
         // Remove first and last empty elements if the line starts/ends with pipe
         if (idx === 0 && c.trim() === '' && trimmed.startsWith('|')) return false;
         if (idx === arr.length - 1 && c.trim() === '' && trimmed.endsWith('|')) return false;
         return true;
       });

       // Look ahead for separator to decide if this is a header
       const nextLine = lines[i + 1]?.trim();
       const nextIsSeparator = nextLine && /^[\s|:-]+$/.test(nextLine) && nextLine.includes('-');

       if (!inTable && nextIsSeparator) {
          inTable = true;
          tableHeader = cells;
          // Skip next line (separator)
          i++; 
          continue;
       }

       if (inTable) {
          tableRows.push(cells);
          continue;
       }
    } else {
       // Not a table line, but we might be in a table
       closeTable();
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
  return html;
};
