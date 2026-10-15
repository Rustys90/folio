import { useRef, useState } from 'react';
import { Input } from '@folio/ui/input';
import { cn } from '@folio/ui/cn';
import type { CellValue, PropertyDef } from '../database-types';

/**
 * Shared cell rendering and editing for database views.
 * Select pills cycle a small token-safe palette so option colors stay
 * deterministic across table and kanban.
 */

const PILL_STYLES = [
  'bg-accent-soft text-accent',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
];

function pillStyleFor(value: string, options: string[] | undefined): string {
  const idx = options ? options.indexOf(value) : -1;
  return PILL_STYLES[(idx < 0 ? 0 : idx) % PILL_STYLES.length]!;
}

/** Human-readable cell text for text / number / date properties. */
export function formatCellValue(property: PropertyDef, value: CellValue): string {
  if (value === undefined || value === '') return '';
  if (property.type === 'number') return String(value);
  if (property.type === 'date' && typeof value === 'string') {
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
  }
  return String(value);
}

/** Read-only cell rendering: pill for selects, text otherwise. */
export function CellValueView({
  property,
  value,
  className,
}: {
  property: PropertyDef;
  value: CellValue;
  className?: string;
}) {
  if (property.type === 'select') {
    if (value === undefined || value === '') {
      return <span className={cn('text-ink-faint', className)}>—</span>;
    }
    return (
      <span
        className={cn(
          'inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium',
          pillStyleFor(String(value), property.options),
          className,
        )}
      >
        {String(value)}
      </span>
    );
  }
  const text = formatCellValue(property, value);
  if (!text) return <span className={cn('text-ink-faint', className)}>—</span>;
  return (
    <span
      className={cn(
        'block truncate',
        property.type === 'number' && 'tabular-nums',
        className,
      )}
    >
      {text}
    </span>
  );
}

export interface CellEditorProps {
  property: PropertyDef;
  value: CellValue;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}

/** Inline editor for a single cell. Commits on blur/Enter (select: on change). */
export function CellEditor({
  property,
  value,
  onCommit,
  onCancel,
  autoFocus = true,
}: CellEditorProps) {
  const [draft, setDraft] = useState<string>(
    value === undefined ? '' : String(value),
  );
  const committed = useRef(false);

  if (property.type === 'select') {
    return (
      <select
        autoFocus={autoFocus}
        value={draft}
        aria-label={property.name}
        onChange={(e) => onCommit(e.target.value === '' ? undefined : e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full rounded-control border border-accent bg-paper px-2 py-1 font-sans text-sm text-ink outline-none"
      >
        <option value="">—</option>
        {(property.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    if (property.type === 'number') {
      if (draft.trim() === '') return onCommit(undefined);
      const n = Number(draft);
      return onCommit(Number.isNaN(n) ? undefined : n);
    }
    onCommit(draft.trim() === '' ? undefined : draft);
  };

  return (
    <Input
      autoFocus={autoFocus}
      type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'}
      value={draft}
      aria-label={property.name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      className="h-8 border-accent px-2 py-1"
    />
  );
}
