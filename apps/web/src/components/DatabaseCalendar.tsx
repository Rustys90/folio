import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { Button } from '@folio/ui/button';
import { Input } from '@folio/ui/input';
import { cn } from '@folio/ui/cn';
import type {
  CellValue,
  DatabaseRow,
  FolioDatabase,
  PropertyDef,
} from '../database-types';
import { calendarDateProperty, newDbId, titleProperty } from '../database-types';
import { CellValueView, formatCellValue } from './database-cells';
import { DatabaseRowEditor, rowTitle } from './DatabaseRowEditor';

/* Local-timezone-safe date helpers (date cells are ISO YYYY-MM-DD). */

function toISODate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when the cell value is a usable ISO date string. */
function isDateCell(value: CellValue): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return (
    dt.getFullYear() === y && dt.getMonth() === m! - 1 && dt.getDate() === d
  );
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const dt = new Date(year, month + delta, 1);
  return { year: dt.getFullYear(), month: dt.getMonth() };
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Monday-first short weekday names, locale-aware. Monday 2026-10-12 anchors. */
const WEEKDAYS: string[] = Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 9, 12 + i).toLocaleDateString(undefined, { weekday: 'short' }),
);

interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

/** 42 cells (6 weeks, Monday-first) covering the visible month grid. */
function buildGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  // JS: Sunday = 0. Monday-first offset: Monday -> 0 … Sunday -> 6.
  const lead = (first.getDay() + 6) % 7;
  const todayISO = toISODate(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );
  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(year, month, 1 - lead + i);
    const iso = toISODate(dt.getFullYear(), dt.getMonth(), dt.getDate());
    days.push({
      iso,
      day: dt.getDate(),
      inMonth: dt.getMonth() === month,
      isToday: iso === todayISO,
    });
  }
  return days;
}

export interface DatabaseCalendarProps {
  database: FolioDatabase;
  /** Every database — relation and rollup cells resolve across this list. */
  databases: FolioDatabase[];
  onChange: (db: FolioDatabase) => void;
}

const MAX_CHIPS = 3;

/**
 * DatabaseCalendar — month grid driven by a date property. Days show row
 * chips; clicking a day opens a side panel with that day's items and an
 * "add item" action that pre-fills the date. Rows without a date land in the
 * unscheduled strip above the grid.
 */
export function DatabaseCalendar({ database, databases, onChange }: DatabaseCalendarProps) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const dateProp = calendarDateProperty(database);
  const dateProps = database.properties.filter((p) => p.type === 'date');

  const setCell = (rowId: string, propertyId: string, value: CellValue) => {
    onChange({
      ...database,
      rows: database.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [propertyId]: value } } : r,
      ),
      updatedAt: Date.now(),
    });
  };

  const addItem = (isoDay: string) => {
    if (!dateProp) return;
    const row: DatabaseRow = {
      id: newDbId('row'),
      cells: { [dateProp.id]: isoDay },
    };
    onChange({ ...database, rows: [...database.rows, row], updatedAt: Date.now() });
    setEditingRowId(row.id);
  };

  const { rowsByDay, unscheduled } = useMemo(() => {
    const map = new Map<string, DatabaseRow[]>();
    const unsched: DatabaseRow[] = [];
    if (dateProp) {
      for (const row of database.rows) {
        const v = row.cells[dateProp.id];
        if (isDateCell(v)) {
          const list = map.get(v) ?? [];
          list.push(row);
          map.set(v, list);
        } else {
          unsched.push(row);
        }
      }
    }
    return { rowsByDay: map, unscheduled: unsched };
  }, [database.rows, dateProp]);

  const grid = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor]);
  const selectedRows = selectedDay ? (rowsByDay.get(selectedDay) ?? []) : [];
  const editingRow = database.rows.find((r) => r.id === editingRowId) ?? null;

  const goToday = () => {
    const t = new Date();
    setCursor({ year: t.getFullYear(), month: t.getMonth() });
    setSelectedDay(toISODate(t.getFullYear(), t.getMonth(), t.getDate()));
  };

  // No date property at all — explain and point at the table view.
  if (!dateProp) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-card border border-hairline bg-paper-deep">
          <CalendarDays className="h-5 w-5 text-ink-faint" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl text-ink">Calendar needs a date column</h2>
          <p className="mt-1 max-w-sm font-sans text-sm text-ink-soft">
            Items land on the calendar from a date property. Add a date column
            in the table view to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        {/* Header: navigation + date-property selector */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-control border border-hairline bg-paper p-0.5">
            <button
              onClick={() => setCursor((c) => addMonths(c.year, c.month, -1))}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-[0.4rem] text-ink-soft transition-colors duration-quick hover:bg-accent-soft hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              onClick={goToday}
              className="rounded-[0.4rem] px-2.5 py-1 font-sans text-xs font-medium text-ink-soft transition-colors duration-quick hover:bg-accent-soft hover:text-ink"
            >
              Today
            </button>
            <button
              onClick={() => setCursor((c) => addMonths(c.year, c.month, 1))}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-[0.4rem] text-ink-soft transition-colors duration-quick hover:bg-accent-soft hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <h2 className="font-display text-xl text-ink">
            {monthLabel(cursor.year, cursor.month)}
          </h2>
          {dateProps.length > 1 && (
            <label className="ml-auto flex items-center gap-2 font-sans text-xs text-ink-faint">
              Date column
              <select
                aria-label="Date column"
                value={dateProp.id}
                onChange={(e) =>
                  onChange({ ...database, calendarDateProp: e.target.value, updatedAt: Date.now() })
                }
                className="rounded-control border border-hairline bg-paper px-2 py-1.5 font-sans text-xs text-ink outline-none focus-visible:border-accent"
              >
                {dateProps.map((p: PropertyDef) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Unscheduled strip */}
        {unscheduled.length > 0 && (
          <section
            aria-label="Unscheduled items"
            className="mb-4 rounded-card border border-hairline bg-paper-deep/60 p-3"
          >
            <p className="mb-2 font-sans text-xs font-medium text-ink-faint">
              Unscheduled — {unscheduled.length} item{unscheduled.length === 1 ? '' : 's'} with
              no {dateProp.name.toLowerCase()} date
            </p>
            <ul className="flex flex-wrap gap-2">
              {unscheduled.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-1.5 rounded-control border border-hairline bg-paper py-1 pl-2.5 pr-1.5 shadow-glass"
                >
                  <button
                    onClick={() => setEditingRowId(row.id)}
                    title="Edit item"
                    className="max-w-40 truncate font-sans text-xs font-medium text-ink hover:text-accent"
                  >
                    {rowTitle(database, row)}
                  </button>
                  <Input
                    type="date"
                    aria-label={`Set ${dateProp.name} for ${rowTitle(database, row)}`}
                    value=""
                    onChange={(e) => {
                      if (isDateCell(e.target.value)) {
                        setCell(row.id, dateProp.id, e.target.value);
                      }
                    }}
                    className="h-6 w-auto border-transparent px-1 py-0 font-sans text-xs text-ink-faint"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1" role="row">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="pb-1 text-center font-sans text-xs font-medium text-ink-faint"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendar">
          {grid.map((day) => {
            const rows = rowsByDay.get(day.iso) ?? [];
            const selected = selectedDay === day.iso;
            return (
              <button
                key={day.iso}
                role="gridcell"
                aria-selected={selected}
                aria-label={`${day.iso}, ${rows.length} items`}
                onClick={() => setSelectedDay(selected ? null : day.iso)}
                className={cn(
                  'flex min-h-24 flex-col items-stretch gap-1 rounded-control border p-1.5 text-left',
                  'transition-colors duration-quick ease-folio',
                  selected
                    ? 'border-accent bg-accent-soft/50'
                    : day.inMonth
                      ? 'border-hairline bg-paper hover:border-accent/40'
                      : 'border-transparent bg-paper-deep/40 hover:border-accent/30',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center self-start rounded-full font-sans text-xs tabular-nums',
                    day.isToday
                      ? 'bg-accent font-semibold text-accent-ink'
                      : day.inMonth
                        ? 'text-ink-soft'
                        : 'text-ink-faint',
                  )}
                >
                  {day.day}
                </span>
                <span className="flex min-h-0 flex-col gap-0.5">
                  {rows.slice(0, MAX_CHIPS).map((row) => (
                    <span
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit ${rowTitle(database, row)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRowId(row.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          setEditingRowId(row.id);
                        }
                      }}
                      className={cn(
                        'truncate rounded-[0.3rem] bg-accent-soft px-1.5 py-0.5 font-sans text-[11px] font-medium text-accent',
                        'transition-colors duration-quick hover:bg-accent hover:text-accent-ink',
                        !day.inMonth && 'opacity-60',
                      )}
                    >
                      {rowTitle(database, row)}
                    </span>
                  ))}
                  {rows.length > MAX_CHIPS && (
                    <span className="px-1.5 font-sans text-[11px] text-ink-faint">
                      +{rows.length - MAX_CHIPS} more
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day panel */}
      {selectedDay && (
        <aside
          aria-label={`Items on ${selectedDay}`}
          className="sticky top-0 w-72 shrink-0 rounded-card border border-hairline bg-paper p-4 shadow-glass"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base text-ink">
              {formatCellValue(
                { id: '', name: '', type: 'date' },
                selectedDay,
              )}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              aria-label="Close day panel"
              className="flex h-6 w-6 items-center justify-center rounded-control text-ink-faint transition-colors duration-quick hover:bg-accent-soft hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {selectedRows.length === 0 ? (
            <p className="font-sans text-sm text-ink-faint">
              Nothing scheduled this day.
            </p>
          ) : (
            <ul className="folio-scroll flex max-h-80 flex-col gap-2 overflow-y-auto">
              {selectedRows.map((row) => {
                const extras = database.properties
                  .filter((p) => p !== titleProperty(database) && p.id !== dateProp.id)
                  .slice(0, 2);
                return (
                  <li key={row.id}>
                    <button
                      onClick={() => setEditingRowId(row.id)}
                      className="w-full rounded-control border border-hairline bg-paper-deep/60 p-2.5 text-left transition-colors duration-quick hover:border-accent/40"
                    >
                      <p className="truncate font-sans text-sm font-medium text-ink">
                        {rowTitle(database, row)}
                      </p>
                      {extras.length > 0 && (
                        <div className="mt-1 flex flex-col gap-1 font-sans text-xs text-ink-soft">
                          {extras.map((p) => (
                            <CellValueView
                              key={p.id}
                              property={p}
                              value={row.cells[p.id]}
                              database={database}
                              databases={databases}
                              row={row}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => addItem(selectedDay)}
            className="mt-3 w-full"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add item on this day
          </Button>
        </aside>
      )}

      {/* Row editor */}
      <DatabaseRowEditor
        database={database}
        databases={databases}
        row={editingRow}
        onClose={() => setEditingRowId(null)}
        onChange={onChange}
      />
    </div>
  );
}
