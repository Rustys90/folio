import { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@folio/ui/button';
import { Input } from '@folio/ui/input';
import { cn } from '@folio/ui/cn';
import type {
  CellValue,
  DatabaseRow,
  FolioDatabase,
  PropertyDef,
} from '../database-types';
import {
  computeRollup,
  isFormulaProperty,
  relationIds,
  relationTarget,
  resolveRelation,
  titleProperty,
} from '../database-types';
import {
  computeFormula,
  formatFormulaResult,
  type FormulaValue as FormulaEvalValue,
} from '../formula';

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
  if (value === undefined || value === '' || Array.isArray(value)) return '';
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

/** Display title of a target row inside a relation chip. */
function relatedRowTitle(target: FolioDatabase, row: DatabaseRow): string {
  const prop = titleProperty(target);
  if (!prop) return 'Untitled';
  return formatCellValue(prop, row.cells[prop.id]) || 'Untitled';
}

const MAX_CHIPS = 3;

/** Read-only relation rendering: one chip per linked row, titles resolved live. */
function RelationChips({
  property,
  value,
  databases,
  className,
}: {
  property: PropertyDef;
  value: CellValue;
  databases: FolioDatabase[] | undefined;
  className?: string;
}) {
  const ids = relationIds(value);
  if (ids.length === 0) {
    return <span className={cn('text-ink-faint', className)}>—</span>;
  }
  const target = databases ? relationTarget(property, databases) : undefined;
  if (!target) {
    return (
      <span className={cn('text-ink-faint', className)}>
        {ids.length} linked
      </span>
    );
  }
  const rows = resolveRelation(property, value, databases ?? []);
  const shown = rows.slice(0, MAX_CHIPS);
  const extra = rows.length - shown.length;
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {shown.map((row) => (
        <span
          key={row.id}
          title={relatedRowTitle(target, row)}
          className="inline-flex max-w-32 items-center truncate rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
        >
          <span className="truncate">{relatedRowTitle(target, row)}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="font-sans text-xs text-ink-faint">+{extra}</span>
      )}
    </span>
  );
}

/** Format a computed number: integers plain, fractions trimmed to 2 decimals. */
function formatComputedNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value
    .toFixed(2)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

/** Read-only rollup rendering: recomputed from live data on every render. */
function RollupValue({
  property,
  database,
  row,
  databases,
  className,
}: {
  property: PropertyDef;
  database: FolioDatabase | undefined;
  row: DatabaseRow | undefined;
  databases: FolioDatabase[] | undefined;
  className?: string;
}) {
  const value =
    database && row
      ? computeRollup(property, database, row, databases ?? [])
      : undefined;
  if (value === undefined) {
    return <span className={cn('text-ink-faint', className)}>—</span>;
  }
  return (
    <span className={cn('tabular-nums', className)}>{formatComputedNumber(value)}</span>
  );
}

/** Read-only formula rendering: recomputed on every render, with a subtle ƒ indicator. */
function FormulaValue({
  property,
  database,
  row,
  databases,
  className,
}: {
  property: PropertyDef;
  database: FolioDatabase | undefined;
  row: DatabaseRow | undefined;
  databases: FolioDatabase[] | undefined;
  className?: string;
}) {
  const result =
    database && row
      ? computeFormula(property, database, row, databases ?? [])
      : { value: undefined as FormulaEvalValue };
  if (result.error) {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5', className)}
        title={result.error}
      >
        <span className="font-serif italic text-ink-faint" aria-hidden>
          ƒ
        </span>
        <span className="truncate font-sans text-xs text-red-600 dark:text-red-400">
          {result.error}
        </span>
      </span>
    );
  }
  const text = formatFormulaResult(result);
  if (text === '—') {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <span className="font-serif italic text-ink-faint" aria-hidden>
          ƒ
        </span>
        <span className="text-ink-faint">—</span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span className="font-serif italic text-ink-faint" aria-hidden>
        ƒ
      </span>
      <span
        className={cn(
          'block truncate',
          typeof result.value === 'number' && 'tabular-nums',
        )}
      >
        {text}
      </span>
    </span>
  );
}

/** Read-only cell rendering: pills for selects, chips for relations, computed rollups and formulas, text otherwise. */
export function CellValueView({
  property,
  value,
  className,
  database,
  databases,
  row,
}: {
  property: PropertyDef;
  value: CellValue;
  className?: string;
  /** The database the cell belongs to (needed for rollups). */
  database?: FolioDatabase;
  /** All databases (needed to resolve relations and rollups). */
  databases?: FolioDatabase[];
  /** The row the cell belongs to (needed for rollups). */
  row?: DatabaseRow;
}) {
  if (property.type === 'relation') {
    return (
      <RelationChips
        property={property}
        value={value}
        databases={databases}
        className={className}
      />
    );
  }
  if (property.type === 'rollup') {
    return (
      <RollupValue
        property={property}
        database={database}
        row={row}
        databases={databases}
        className={className}
      />
    );
  }
  if (isFormulaProperty(property)) {
    return (
      <FormulaValue
        property={property}
        database={database}
        row={row}
        databases={databases}
        className={className}
      />
    );
  }
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
  /** The database the cell belongs to (needed for relation/rollup editing). */
  database?: FolioDatabase;
  /** All databases (needed to resolve relation targets). */
  databases?: FolioDatabase[];
  /** The row the cell belongs to (needed for read-only rollup display). */
  row?: DatabaseRow;
}

/**
 * Multi-select picker for relation cells. Selection is staged locally and
 * committed once with Done; Escape discards. Rows are matched by the target
 * database's title property, with a search filter.
 */
function RelationEditor({
  property,
  value,
  databases,
  onCommit,
  onCancel,
}: {
  property: PropertyDef;
  value: CellValue;
  databases: FolioDatabase[] | undefined;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(() => relationIds(value));
  const target = databases ? relationTarget(property, databases) : undefined;

  if (!target) {
    return (
      <p className="font-sans text-xs text-ink-faint">
        The related database was deleted. Delete this column to clean up.
      </p>
    );
  }

  const titleProp = titleProperty(target);
  const needle = query.trim().toLowerCase();
  const matches = target.rows.filter((row) => {
    if (!needle) return true;
    const title = titleProp
      ? formatCellValue(titleProp, row.cells[titleProp.id]).toLowerCase()
      : '';
    return title.includes(needle) || row.id.toLowerCase().includes(needle);
  });
  const selectedSet = new Set(selected);

  const toggle = (rowId: string) => {
    setSelected((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId],
    );
  };

  const commit = () => onCommit(selected.length > 0 ? selected : undefined);

  return (
    <div
      className="flex min-w-52 flex-col gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${target.title || 'rows'}…`}
        aria-label={`Search ${target.title || 'related rows'}`}
        className="h-8 border-accent px-2 py-1"
      />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Selected">
          {resolveRelation(property, selected, databases ?? []).map((row) => (
            <span
              key={row.id}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2 pr-1 text-xs font-medium text-accent"
            >
              <span className="max-w-28 truncate">
                {relatedRowTitle(target, row)}
              </span>
              <button
                type="button"
                onClick={() => toggle(row.id)}
                aria-label={`Remove ${relatedRowTitle(target, row)}`}
                className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-accent/20"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div
        role="listbox"
        aria-label="Related rows"
        aria-multiselectable
        className="folio-scroll flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-control border border-hairline bg-paper p-1"
      >
        {matches.length === 0 && (
          <p className="px-2 py-3 text-center font-sans text-xs text-ink-faint">
            {target.rows.length === 0
              ? `No rows in ${target.title || 'this database'} yet.`
              : 'No matches.'}
          </p>
        )}
        {matches.map((row) => {
          const isSelected = selectedSet.has(row.id);
          return (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => toggle(row.id)}
              className={cn(
                'flex items-center gap-2 rounded-[0.3rem] px-2 py-1.5 text-left font-sans text-sm transition-colors duration-quick',
                isSelected
                  ? 'bg-accent-soft text-ink'
                  : 'text-ink-soft hover:bg-paper-deep hover:text-ink',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                  isSelected
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-hairline',
                )}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {relatedRowTitle(target, row)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={commit}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Inline editor for a single cell. Commits on blur/Enter (select: on change). */
export function CellEditor({
  property,
  value,
  onCommit,
  onCancel,
  autoFocus = true,
  database,
  databases,
  row,
}: CellEditorProps) {
  if (property.type === 'relation') {
    return (
      <RelationEditor
        property={property}
        value={value}
        databases={databases}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  if (property.type === 'rollup') {
    return (
      <div className="flex flex-col gap-1 py-1">
        <RollupValue
          property={property}
          database={database}
          row={row}
          databases={databases}
          className="font-sans text-sm text-ink"
        />
        <p className="font-sans text-xs text-ink-faint">
          Computed automatically — edit the linked rows instead.
        </p>
      </div>
    );
  }

  if (isFormulaProperty(property)) {
    return (
      <div className="flex flex-col gap-1 py-1">
        <FormulaValue
          property={property}
          database={database}
          row={row}
          databases={databases}
          className="font-sans text-sm text-ink"
        />
        <p className="font-mono text-xs text-ink-faint">
          {property.formulaExpression || 'No expression set.'}
        </p>
        <p className="font-sans text-xs text-ink-faint">
          Computed automatically — edit the expression or the referenced
          properties.
        </p>
      </div>
    );
  }

  return (
    <ScalarCellEditor
      property={property}
      value={value}
      onCommit={onCommit}
      onCancel={onCancel}
      autoFocus={autoFocus}
    />
  );
}

function ScalarCellEditor({
  property,
  value,
  onCommit,
  onCancel,
  autoFocus,
}: {
  property: PropertyDef;
  value: CellValue;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
  autoFocus: boolean;
}) {
  const [draft, setDraft] = useState<string>(
    value === undefined || Array.isArray(value) ? '' : String(value),
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
