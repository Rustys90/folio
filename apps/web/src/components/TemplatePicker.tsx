import { useEffect, useState } from 'react';
import { ModalRoot, ModalContent, ModalTitle, ModalDescription } from '@folio/ui/modal';
import { cn } from '@folio/ui/cn';
import { FileText, Table2, LayoutTemplate } from 'lucide-react';
import {
  pageTemplates,
  databaseTemplates,
  type PageTemplate,
  type DatabaseTemplate,
} from '../data/templates';

export type TemplateKind = 'page' | 'database';

export interface TemplatePickerProps {
  kind: TemplateKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPage: (template: PageTemplate | null) => void;
  onSelectDatabase: (template: DatabaseTemplate | null) => void;
}

const BLANK_PAGE_CARD = {
  icon: '📄',
  name: 'Blank page',
  description: 'Start from an empty canvas.',
};

const BLANK_DATABASE_CARD = {
  icon: '🗂️',
  name: 'Blank database',
  description: 'A name and a status column to build on.',
};

function TemplateCard({
  icon,
  name,
  description,
  onClick,
  autoFocus,
}: {
  icon: string;
  name: string;
  description: string;
  onClick: () => void;
  autoFocus?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      autoFocus={autoFocus}
      className={cn(
        'group flex flex-col gap-1.5 rounded-card border border-hairline bg-paper p-4 text-left',
        'transition-[transform,border-color,box-shadow] duration-quick ease-folio',
        'hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-glass',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
      )}
    >
      <span className="text-2xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="font-sans text-sm font-semibold text-ink">{name}</span>
      <span className="font-sans text-xs leading-relaxed text-ink-soft">{description}</span>
    </button>
  );
}

/**
 * TemplatePicker — the "new from template" gallery. Blank is always the
 * first card so the fastest path stays the fastest.
 */
export function TemplatePicker({
  kind,
  open,
  onOpenChange,
  onSelectPage,
  onSelectDatabase,
}: TemplatePickerProps) {
  const [query, setQuery] = useState('');

  // Fresh search on every open.
  useEffect(() => {
    if (open) setQuery('');
  }, [open ]);

  const choose = (template: PageTemplate | DatabaseTemplate | null) => {
    onOpenChange(false);
    if (kind === 'page') onSelectPage(template as PageTemplate | null);
    else onSelectDatabase(template as DatabaseTemplate | null);
  };

  const q = query.trim().toLowerCase();
  const matches = (name: string, description: string) =>
    q === '' ||
    name.toLowerCase().includes(q) ||
    description.toLowerCase().includes(q);

  const templates =
    kind === 'page'
      ? pageTemplates.filter((t) => matches(t.name, t.description))
      : databaseTemplates.filter((t) => matches(t.name, t.description));
  const blank = kind === 'page' ? BLANK_PAGE_CARD : BLANK_DATABASE_CARD;
  const showBlank = matches(blank.name, blank.description);

  return (
    <ModalRoot open={open} onOpenChange={onOpenChange}>
      <ModalContent
        aria-label={kind === 'page' ? 'Page templates' : 'Database templates'}
        className="max-w-2xl"
      >
        <ModalTitle className="flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-accent" aria-hidden />
          {kind === 'page' ? 'New page from template' : 'New database from template'}
        </ModalTitle>
        <ModalDescription>
          {kind === 'page'
            ? 'Pick a starting point — or go blank and make it your own.'
            : 'Pre-built databases with columns and sample rows you can keep or clear.'}
        </ModalDescription>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          aria-label="Search templates"
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'mt-4 flex h-10 w-full rounded-control border border-hairline bg-paper px-3 py-2',
            'font-sans text-sm text-ink placeholder:text-ink-faint',
            'focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30',
          )}
        />

        <div
          role="listbox"
          aria-label="Templates"
          className="folio-scroll mt-4 grid max-h-[min(24rem,55vh)] grid-cols-1 gap-3 overflow-y-auto pr-0.5 sm:grid-cols-2"
        >
          {showBlank && (
            <TemplateCard
              icon={blank.icon}
              name={blank.name}
              description={blank.description}
              onClick={() => choose(null)}
              autoFocus
            />
          )}
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              icon={t.icon}
              name={t.name}
              description={t.description}
              onClick={() => choose(t)}
            />
          ))}
          {!showBlank && templates.length === 0 && (
            <p className="col-span-full px-3 py-8 text-center font-sans text-sm text-ink-faint">
              No templates match “{query}”.
            </p>
          )}
        </div>

        <p className="mt-4 flex items-center gap-2 font-sans text-xs text-ink-faint">
          {kind === 'page' ? (
            <FileText className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Table2 className="h-3.5 w-3.5" aria-hidden />
          )}
          {kind === 'page'
            ? 'Template content is editable the moment the page opens.'
            : 'Sample rows are yours to edit or delete — the structure is the point.'}
        </p>
      </ModalContent>
    </ModalRoot>
  );
}
