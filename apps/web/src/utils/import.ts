import type {
  CellValue,
  DatabaseRow,
  FolioDatabase,
  PropertyDef,
  PropertyType,
} from '../database-types';
import { newDbId } from '../database-types';

/**
 * Clean-room importers: Markdown → HTML blocks, CSV → database, HTML → blocks.
 * No third-party parsing dependencies — line/regex-based on purpose so the
 * behavior is fully ours to document and fix.
 */

/** User-facing import failure. Message is safe to show verbatim in the UI. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Turn "notes.md" into "notes". Falls back to "Imported" for odd names. */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return base === '' ? 'Imported' : base;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ */
/* Markdown → HTML                                                     */
/* ------------------------------------------------------------------ */

/**
 * Inline markdown: `code`, [links](url), **bold**, *italic*, ~~strike~~.
 * Code spans are extracted first so nothing inside them is interpreted.
 */
function inlineMarkdown(text: string): string {
  // Private-use chars bracket the placeholders — never control characters.
  const codeSpans: string[] = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\ue000${codeSpans.length - 1}\ue001`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  out = out.replace(/(\d+)/g, (_, i: string) => codeSpans[Number(i)] ?? '');
  return out;
}

interface ListLine {
  indent: number;
  ordered: boolean;
  checked: boolean | null;
  content: string;
}

function parseListLine(line: string): ListLine | null {
  const indent = line.match(/^ */)?.[0].length ?? 0;
  const trimmed = line.slice(indent);
  const task = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
  if (task) {
    return {
      indent,
      ordered: false,
      checked: task[1]!.toLowerCase() === 'x',
      content: task[2]!,
    };
  }
  const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
  if (bullet) return { indent, ordered: false, checked: null, content: bullet[1]! };
  const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
  if (ordered) return { indent, ordered: true, checked: null, content: ordered[1]! };
  return null;
}

interface OpenListItem {
  checked: boolean;
  content: string;
  nested: string;
}

interface ListFrame {
  indent: number;
  ordered: boolean;
  task: boolean;
  openTag: string;
  closeTag: string;
  parts: string[];
  open: OpenListItem | null;
}

/**
 * Render a run of consecutive list lines (possibly nested by indentation)
 * into tiptap-compatible HTML. `- [ ]` items become task lists so Folio's
 * checkbox blocks pick them up.
 */
function renderList(lines: ListLine[]): string {
  const stack: ListFrame[] = [];
  let html = '';

  const closeOpen = (frame: ListFrame): string => {
    const item = frame.open;
    frame.open = null;
    if (!item) return '';
    return frame.task
      ? `<li data-type="taskItem" data-checked="${item.checked}"><p>${item.content}</p>${item.nested}</li>`
      : `<li>${item.content}${item.nested}</li>`;
  };

  // The open item is always the most recent, so it renders after the
  // already-closed parts.
  const closeFrame = (frame: ListFrame): string =>
    `${frame.openTag}${frame.parts.join('')}${closeOpen(frame)}${frame.closeTag}`;

  /** Attach a finished nested list to its parent item, or to the output. */
  const attachNested = (nestedHtml: string): void => {
    const parent = stack[stack.length - 1];
    if (!parent) {
      html += nestedHtml;
    } else if (parent.open) {
      parent.open.nested += nestedHtml;
    } else {
      parent.parts.push(nestedHtml);
    }
  };

  for (const line of lines) {
    const task = line.checked !== null;
    // Pop frames deeper than this line into their parents.
    while (stack.length > 0 && stack[stack.length - 1]!.indent > line.indent) {
      attachNested(closeFrame(stack.pop()!));
    }
    let frame = stack[stack.length - 1];
    // Same indent but a different list kind: finish this list, start a new one.
    if (
      frame &&
      frame.indent === line.indent &&
      (frame.ordered !== line.ordered || frame.task !== task)
    ) {
      attachNested(closeFrame(stack.pop()!));
      frame = stack[stack.length - 1];
    }
    if (!frame || frame.indent < line.indent) {
      // New (possibly nested) list — the parent item stays open to receive it.
      const openTag = task ? '<ul data-type="taskList">' : line.ordered ? '<ol>' : '<ul>';
      const closeTag = `</${openTag.slice(1, 3)}>`;
      stack.push({
        indent: line.indent,
        ordered: line.ordered,
        task,
        openTag,
        closeTag,
        parts: [],
        open: null,
      });
      frame = stack[stack.length - 1]!;
    } else {
      frame.parts.push(closeOpen(frame));
    }
    frame.open = {
      checked: line.checked ?? false,
      content: inlineMarkdown(line.content),
      nested: '',
    };
  }

  while (stack.length > 0) {
    attachNested(closeFrame(stack.pop()!));
  }
  return html;
}

/** Convert a markdown document into tiptap-compatible HTML blocks. */
export function markdownToHtml(markdown: string): string {
  if (markdown.trim() === '') {
    throw new ImportError('That file is empty — there is nothing to import.');
  }
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Fenced code block.
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      flushParagraph();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      i += 1; // consume closing fence (or EOF)
      out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // ATX heading (Folio supports h1–h3; deeper levels clamp to h3).
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1]!.length, 3);
      out.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`);
      i += 1;
      continue;
    }

    // Setext heading underline.
    if (
      paragraph.length === 1 &&
      (trimmed === '===' || trimmed === '---') &&
      !/^\d+[.)]\s/.test(line)
    ) {
      const text = paragraph.pop()!;
      out.push(trimmed === '===' ? `<h1>${text}</h1>` : `<h2>${text}</h2>`);
      i += 1;
      continue;
    }

    // Horizontal rule.
    if (/^([-*_]\s*){3,}$/.test(trimmed)) {
      flushParagraph();
      out.push('<hr>');
      i += 1;
      continue;
    }

    // Blockquote run.
    if (/^>\s?/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote><p>${inlineMarkdown(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // List run (possibly nested).
    if (parseListLine(line) !== null) {
      flushParagraph();
      const listLines: ListLine[] = [];
      while (i < lines.length) {
        const parsed = parseListLine(lines[i]!);
        if (parsed === null) break;
        listLines.push(parsed);
        i += 1;
      }
      out.push(renderList(listLines));
      continue;
    }

    // Blank line ends a paragraph.
    if (trimmed === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    paragraph.push(trimmed);
    i += 1;
  }
  flushParagraph();

  if (out.length === 0) {
    throw new ImportError('That file is empty — there is nothing to import.');
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* CSV → database                                                      */
/* ------------------------------------------------------------------ */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Parse CSV honoring quoted fields (commas, quotes-as-`""`, and newlines
 * inside quotes). Throws ImportError with a friendly message on empty or
 * malformed input.
 */
export function parseCsv(text: string): ParsedCsv {
  const source = text.replace(/^\uFEFF/, '');
  if (source.trim() === '') {
    throw new ImportError('That CSV file is empty — there is nothing to import.');
  }
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      // A quote only opens a quoted field at the very start of a field;
      // mid-field quotes are treated literally (lenient, like spreadsheets).
      if (field === '') inQuotes = true;
      else field += ch;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += ch === '\r' && source[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (inQuotes) {
    throw new ImportError(
      'That CSV looks malformed — a quoted field is never closed. Check for a missing closing quote.',
    );
  }
  row.push(field);
  rows.push(row);

  // Drop trailing blank lines.
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) {
    rows.pop();
  }
  if (rows.length === 0) {
    throw new ImportError('That CSV file is empty — there is nothing to import.');
  }

  const width = rows[0]!.length;
  const headers = rows[0]!.map((h, index) => {
    const name = h.trim();
    return name === '' ? `Column ${index + 1}` : name;
  });
  if (headers.every((h) => /^Column \d+$/.test(h))) {
    throw new ImportError(
      'The first row has no headers — Folio needs a header row to name the database columns.',
    );
  }
  if (rows.length === 1) {
    throw new ImportError(
      'That CSV only has a header row and no data rows — there is nothing to import.',
    );
  }
  const dataRows = rows.slice(1).map((r) => {
    const padded = [...r];
    while (padded.length < width) padded.push('');
    return padded.slice(0, width).map((c) => c.trim());
  });
  return { headers, rows: dataRows };
}

const NUMBER_RE = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}([T ]\d{1,2}:\d{2}(:\d{2})?)?$/;

/**
 * Infer a Folio property type from a column's values: number when every
 * non-empty cell is numeric, date when every non-empty cell is date-like,
 * select for short closed vocabularies on suggestive header names, else text.
 */
export function inferPropertyType(header: string, values: string[]): PropertyType {
  const nonEmpty = values.filter((v) => v !== '');
  if (nonEmpty.length === 0) return 'text';
  if (nonEmpty.every((v) => NUMBER_RE.test(v))) return 'number';
  if (nonEmpty.every((v) => DATE_RE.test(v) && !Number.isNaN(Date.parse(v)))) return 'date';
  const distinct = new Set(nonEmpty.map((v) => v.toLowerCase()));
  if (
    distinct.size <= 12 &&
    nonEmpty.length >= 2 &&
    /status|stage|priority|channel|category|type|label|phase/i.test(header)
  ) {
    return 'select';
  }
  return 'text';
}

/** Build a FolioDatabase from parsed CSV: headers become properties. */
export function csvToDatabase(title: string, parsed: ParsedCsv): FolioDatabase {
  const properties: PropertyDef[] = parsed.headers.map((header) => {
    const column = parsed.rows.map((r) => r[parsed.headers.indexOf(header)] ?? '');
    const type = inferPropertyType(header, column);
    const def: PropertyDef = { id: newDbId('prop'), name: header, type };
    if (type === 'select') {
      const seen = new Set<string>();
      for (const value of column) {
        if (value !== '' && !seen.has(value.toLowerCase())) {
          seen.add(value.toLowerCase());
        }
      }
      def.options = [...seen].map(
        (lower) => column.find((v) => v.toLowerCase() === lower) ?? lower,
      );
    }
    return def;
  });

  const rows: DatabaseRow[] = parsed.rows.map((cells) => {
    const record: Record<string, CellValue> = {};
    cells.forEach((raw, index) => {
      const prop = properties[index]!;
      if (raw === '') return;
      if (prop.type === 'number') record[prop.id] = Number(raw);
      else record[prop.id] = raw;
    });
    return { id: newDbId('row'), cells: record };
  });

  return {
    id: newDbId('db'),
    title,
    icon: '📥',
    properties,
    rows,
    view: 'table',
    kanbanGroupBy: properties.find((p) => p.type === 'select')?.id ?? null,
    calendarDateProp: properties.find((p) => p.type === 'date')?.id ?? null,
    updatedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/* HTML → blocks                                                       */
/* ------------------------------------------------------------------ */

const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'div',
  'section',
  'article',
  'table',
  'tr',
]);

/** Inline formatting inside a block: bold, italic, code, links, line breaks. */
function inlineFromNode(node: Node): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(child.textContent ?? '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') out += '<br>';
      else if (tag === 'strong' || tag === 'b') out += `<strong>${inlineFromNode(el)}</strong>`;
      else if (tag === 'em' || tag === 'i') out += `<em>${inlineFromNode(el)}</em>`;
      else if (tag === 's' || tag === 'strike' || tag === 'del')
        out += `<s>${inlineFromNode(el)}</s>`;
      else if (tag === 'code') out += `<code>${inlineFromNode(el)}</code>`;
      else if (tag === 'a') {
        const href = el.getAttribute('href');
        out += href
          ? `<a href="${escapeHtml(href)}">${inlineFromNode(el)}</a>`
          : inlineFromNode(el);
      } else if (BLOCK_TAGS.has(tag)) out += inlineFromNode(el);
      else out += inlineFromNode(el);
    }
  }
  return out;
}

function blockFromElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
      return `<${tag}>${inlineFromNode(el)}</${tag}>`;
    case 'h4':
    case 'h5':
    case 'h6':
      return `<h3>${inlineFromNode(el)}</h3>`;
    case 'blockquote':
      return `<blockquote><p>${inlineFromNode(el)}</p></blockquote>`;
    case 'pre': {
      const code = el.querySelector('code');
      return `<pre><code>${escapeHtml((code ?? el).textContent ?? '')}</code></pre>`;
    }
    case 'ul':
    case 'ol': {
      const items = Array.from(el.children)
        .filter((c) => c.tagName.toLowerCase() === 'li')
        .map((li) => {
          const nested = Array.from(li.children)
            .filter((c) => ['ul', 'ol'].includes(c.tagName.toLowerCase()))
            .map((n) => blockFromElement(n as HTMLElement))
            .join('');
          const textNodes = Array.from(li.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => escapeHtml(n.textContent ?? ''))
            .join('');
          const inline = Array.from(li.children)
            .filter((c) => !['ul', 'ol'].includes(c.tagName.toLowerCase()))
            .map((c) => inlineFromNode(c))
            .join('');
          return `<li>${textNodes}${inline}${nested}</li>`;
        })
        .join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'hr':
      return '<hr>';
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tr'))
        .map((tr) => {
          const cells = Array.from(tr.children).map((c) => inlineFromNode(c));
          return cells.length > 0 ? `<p>${cells.join(' · ')}</p>` : '';
        })
        .filter(Boolean);
      return rows.join('\n');
    }
    default: {
      const text = inlineFromNode(el).trim();
      return text === '' ? '' : `<p>${text}</p>`;
    }
  }
}

/**
 * Basic HTML import: keep headings, paragraphs, lists, quotes, and code —
 * everything else is flattened to plain paragraphs. Scripts, styles, and
 * forms are dropped.
 */
export function htmlToBlocks(html: string): string {
  if (html.trim() === '') {
    throw new ImportError('That file is empty — there is nothing to import.');
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const el of Array.from(doc.querySelectorAll('script, style, form, iframe, noscript'))) {
    el.remove();
  }
  const root = doc.body ?? doc.documentElement;
  const blocks: string[] = [];
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').trim();
      if (text !== '') blocks.push(`<p>${escapeHtml(text)}</p>`);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const block = blockFromElement(child as HTMLElement);
      if (block !== '') blocks.push(block);
    }
  }
  if (blocks.length === 0) {
    throw new ImportError("Couldn't find any readable content in that HTML file.");
  }
  return blocks.join('\n');
}
