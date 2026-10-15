import { useEffect, useMemo, useRef, useState } from 'react';
import { ModalRoot, ModalContent, ModalTitle, ModalDescription } from '@folio/ui/modal';
import { cn } from '@folio/ui/cn';
import { FileText, Table2, Plus, Moon, Sun, Search, CornerDownLeft } from 'lucide-react';
import type { FolioPage } from '../types';
import type { FolioDatabase } from '../database-types';
import { shortcutLabel } from '../hooks/useShortcuts';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: FolioPage[];
  databases: FolioDatabase[];
  onSelectPage: (id: string) => void;
  onSelectDatabase: (id: string) => void;
  onNewPage: () => void;
  onNewDatabase: () => void;
  dark: boolean;
  onToggleDark: () => void;
}

type PaletteItem =
  | { kind: 'page'; id: string; title: string; icon: string }
  | { kind: 'database'; id: string; title: string; icon: string }
  | {
      kind: 'action';
      id: 'new-page' | 'new-database' | 'toggle-dark';
      title: string;
      hint: string;
    };

/**
 * Fuzzy subsequence score — consecutive-character and word-start matches rank
 * higher. Returns null when the query is not a subsequence of the target.
 */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      if (lastMatch === i - 1) score += 2;
      else if (i === 0 || t[i - 1] === ' ') score += 2;
      else score += 1;
      lastMatch = i;
      qi += 1;
    }
  }
  return qi === q.length ? score : null;
}

function displayTitle(title: string): string {
  return title.trim() === '' ? 'Untitled' : title;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-hairline bg-paper-deep px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-soft">
      {children}
    </kbd>
  );
}

/**
 * CommandPalette — ⌘K jump-to-anything. Fuzzy-searches pages and databases,
 * plus workspace actions. Up/Down + Enter to navigate, Esc to close.
 * Rendered on the @folio/ui Modal shell with liquid-glass styling.
 */
export function CommandPalette({
  open,
  onOpenChange,
  pages,
  databases,
  onSelectPage,
  onSelectDatabase,
  onNewPage,
  onNewDatabase,
  dark,
  onToggleDark,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fresh state on every open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const actions: PaletteItem[] = [
      { kind: 'action', id: 'new-page', title: 'New page', hint: shortcutLabel('n') },
      { kind: 'action', id: 'new-database', title: 'New database', hint: '' },
      {
        kind: 'action',
        id: 'toggle-dark',
        title: dark ? 'Switch to light mode' : 'Switch to dark mode',
        hint: shortcutLabel('d'),
      },
    ];

    const pageItems: PaletteItem[] = pages.map((p) => ({
      kind: 'page',
      id: p.id,
      title: displayTitle(p.title),
      icon: p.icon,
    }));
    const dbItems: PaletteItem[] = databases.map((d) => ({
      kind: 'database',
      id: d.id,
      title: displayTitle(d.title),
      icon: d.icon,
    }));

    if (q === '') return [...pageItems, ...dbItems, ...actions];

    const rank = (title: string) => fuzzyScore(q, title);
    const ranked = (list: PaletteItem[]) =>
      list
        .map((item) => ({ item, score: rank(item.title) }))
        .filter((r): r is { item: PaletteItem; score: number } => r.score !== null)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.item);

    return [...ranked(pageItems), ...ranked(dbItems), ...ranked(actions)];
  }, [query, pages, databases, dark]);

  // Keep the active index in range when the list changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(items.length - 1, 0)));
  }, [items.length]);

  // Keep the active row visible.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runItem = (item: PaletteItem) => {
    onOpenChange(false);
    switch (item.kind) {
      case 'page':
        onSelectPage(item.id);
        break;
      case 'database':
        onSelectDatabase(item.id);
        break;
      case 'action':
        if (item.id === 'new-page') onNewPage();
        else if (item.id === 'new-database') onNewDatabase();
        else onToggleDark();
        break;
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
    } else if (event.key === 'Enter') {
      const item = items[activeIndex];
      if (item) runItem(item);
    }
  };

  return (
    <ModalRoot open={open} onOpenChange={onOpenChange}>
      <ModalContent
        aria-label="Command palette"
        className={cn(
          // Top-anchored palette instead of the centered dialog default.
          'top-[16%] max-w-lg translate-y-0 overflow-hidden p-0',
        )}
      >
        <ModalTitle className="sr-only">Command palette</ModalTitle>
        <ModalDescription className="sr-only">
          Search pages and databases, or run a workspace action.
        </ModalDescription>

        <label className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages, databases, and actions…"
            aria-label="Search"
            role="combobox"
            aria-expanded
            aria-controls="folio-palette-list"
            aria-activedescendant={items[activeIndex] ? `folio-palette-${activeIndex}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent font-sans text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <Kbd>{shortcutLabel('k')}</Kbd>
        </label>

        <div
          ref={listRef}
          id="folio-palette-list"
          role="listbox"
          aria-label="Results"
          className="folio-scroll max-h-[min(22rem,50vh)] overflow-y-auto p-2"
        >
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-faint">
              No matches for “{query}”.
            </p>
          ) : (
            items.map((item, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  id={`folio-palette-${index}`}
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runItem(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left font-sans text-sm',
                    'transition-colors duration-quick ease-folio',
                    active ? 'bg-accent-soft text-ink' : 'text-ink-soft',
                  )}
                >
                  {item.kind === 'page' && (
                    <span className="shrink-0 text-base leading-none" aria-hidden>
                      {item.icon}
                    </span>
                  )}
                  {item.kind === 'page' && (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  )}
                  {item.kind === 'database' && (
                    <Table2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  )}
                  {item.kind === 'action' && item.id === 'new-page' && (
                    <Plus className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  )}
                  {item.kind === 'action' && item.id === 'new-database' && (
                    <Table2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  )}
                  {item.kind === 'action' &&
                    item.id === 'toggle-dark' &&
                    (dark ? (
                      <Sun className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                    ) : (
                      <Moon className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                    ))}
                  <span className="flex-1 truncate">
                    {item.kind === 'page' && item.title === 'Untitled' ? (
                      <span className="text-ink-faint">Untitled</span>
                    ) : (
                      item.title
                    )}
                  </span>
                  {item.kind === 'database' && (
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">
                      Database
                    </span>
                  )}
                  {item.kind === 'action' && item.hint && <Kbd>{item.hint}</Kbd>}
                  {active && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-hairline px-4 py-2.5 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> select
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>{shortcutLabel('n')}</Kbd> new page
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>{shortcutLabel('d')}</Kbd> dark mode
          </span>
        </div>
      </ModalContent>
    </ModalRoot>
  );
}
