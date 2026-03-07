import { Theme, themes } from '../../lib/theme';

export const renderMarkdown = (raw: string, theme: Theme) => {
  const content = raw.trim().replace(/\n{3,}/g, '\n\n');
  const lines = content.split(/\r?\n/);
  let html = '';
  let paragraph = '';
  let inList = false;
  let listTag: 'ul' | 'ol' | null = null;

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

  for (const line of lines) {
    const trimmed = line.trim();

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
  return html;
};
