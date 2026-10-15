import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
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
  newDbId,
  timelineDateProperties,
  timelineEndProperty,
  timelineStartProperty,
} from '../database-types';
import { DatabaseRowEditor, rowTitle } from './DatabaseRowEditor';

/* Local-timezone-safe date helpers (date cells are ISO YYYY-MM-DD). */

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

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function toISODate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

/** ISO date `delta` days after `iso`, DST-safe via rounded day math. */
function addDaysISO(iso: string, delta: number): string {
  const dt = parseISO(iso);
  dt.setDate(dt.getDate() + delta);
  return toISODate(dt);
}

/** Whole days from `a` to `b` (negative when b is earlier). */
function diffDays(a: string, b: string): number {
  return Math.round(
    (parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000,
  );
}

type TimelineScale = 'week' | 'month' | 'quarter';

const SCALES: {
  id: TimelineScale;
  label: string;
  dayWidth: number;
  backDays: number;
  fwdDays: number;
}[] = [
  { id: 'week', label: 'Weeks', dayWidth: 72, backDays: 14, fwdDays: 84 },
  { id: 'month', label: 'Months', dayWidth: 22, backDays: 30, fwdDays: 150 },
  { id: 'quarter', label: 'Quarters', dayWidth: 7, backDays: 30, fwdDays: 335 },
];

/** Hard cap on rendered day columns so pathological date ranges stay cheap. */
const MAX_COLUMNS = 1200;

const TITLE_WIDTH = 192;
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 20;

interface TimelineColumn {
  iso: string;
  day: number;
  isToday: boolean;
  isWeekend: boolean;
  isMonthStart: boolean;
  group: string;
  detail: string;
}

function quarterLabel(year: number, month: number): string {
  return `Q${Math.floor(month / 3) + 1} ${year}`;
}

function monthGroupLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

/** Day columns covering the window, in order. */
function buildColumns(startISO: string, count: number, scale: TimelineScale): TimelineColumn[] {
  const today = todayISO();
  const cols: TimelineColumn[] = [];
  for (let i = 0; i < count; i++) {
    const iso = addDaysISO(startISO, i);
    const dt = parseISO(iso);
    const year = dt.getFullYear();
    const month = dt.getMonth();
    cols.push({
      iso,
      day: dt.getDate(),
      isToday: iso === today,
      isWeekend: dt.getDay() === 0 || dt.getDay() === 6,
      isMonthStart: dt.getDate() === 1,
      group: scale === 'quarter' ? quarterLabel(year, month) : monthGroupLabel(year, month),
      detail:
        scale === 'quarter'
          ? dt.getDate() === 1
            ? String(month + 1)
            : ''
          : String(dt.getDate()),
    });
  }
  return cols;
}

export interface DatabaseTimelineProps {
  database: FolioDatabase;
  /** Every database — relation and rollup cells resolve across this list. */
  databases: FolioDatabase[];
  onChange: (db: FolioDatabase) => void;
}

type DragMode = 'move' | 'start' | 'end';

interface DragState {
  rowId: string;
  mode: DragMode;
  pointerId: number;
  startX: number;
  origStart: string;
  origEnd: string | null;
  moved: boolean;
}

interface BarDates {
  start: string;
  /** Null = milestone (start date only). */
  end: string | null;
}

/**
 * DatabaseTimeline — a Gantt-style view. Rows are bars between a start and
 * end date property; rows with only a start date render as milestone
 * diamonds. Bars drag horizontally to reschedule (duration preserved) and
 * resize from either edge. Clicking a bar opens the row editor.
 */
export function DatabaseTimeline({ database, databases, onChange }: DatabaseTimelineProps) {
  const [scale, setScale] = useState<TimelineScale>('month');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<{ rowId: string; dates: BarDates } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startProp = timelineStartProperty(database);
  const endProp = timelineEndProperty(database);
  const dateProps = timelineDateProperties(database);

  const cfg = SCALES.find((s) => s.id === scale)!;
  const dayWidth = cfg.dayWidth;

  const setCell = (rowId: string, propertyId: string, value: CellValue) => {
    onChange({
      ...database,
      rows: database.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [propertyId]: value } } : r,
      ),
      updatedAt: Date.now(),
    });
  };

  /** Move the bar, preserving duration. `end` may be null for milestones. */
  const reschedule = (rowId: string, start: string, end: string | null) => {
    if (!startProp) return;
    onChange({
      ...database,
      rows: database.rows.map((r) => {
        if (r.id !== rowId) return r;
        const cells = { ...r.cells, [startProp.id]: start };
        if (endProp) {
          if (end === null) delete cells[endProp.id];
          else cells[endProp.id] = end;
        }
        return { ...r, cells };
      }),
      updatedAt: Date.now(),
    });
  };

  const addItem = () => {
    if (!startProp) return;
    const row: DatabaseRow = {
      id: newDbId('row'),
      cells: { [startProp.id]: todayISO() },
    };
    onChange({ ...database, rows: [...database.rows, row], updatedAt: Date.now() });
    setEditingRowId(row.id);
  };

  /** Scheduled rows: bar dates resolved from the start/end properties. */
  const { scheduled, unscheduled } = useMemo(() => {
    const sched: { row: DatabaseRow; dates: BarDates }[] = [];
    const unsched: DatabaseRow[] = [];
    if (startProp) {
      for (const row of database.rows) {
        const start = row.cells[startProp.id];
        if (!isDateCell(start)) {
          unsched.push(row);
          continue;
        }
        let end: string | null = null;
        if (endProp && endProp.id !== startProp.id) {
          const raw = row.cells[endProp.id];
          // Guard against end-before-start data; clamp to a one-day bar.
          end = isDateCell(raw) && diffDays(start, raw) >= 0 ? raw : null;
        }
        sched.push({ row, dates: { start, end } });
      }
    }
    return { scheduled: sched, unscheduled: unsched };
  }, [database.rows, startProp, endProp]);

  /** Window: data extent padded to the scale's back/forward reach, capped. */
  const { windowStart, columns } = useMemo(() => {
    let min = todayISO();
    let max = todayISO();
    for (const { dates } of scheduled) {
      if (diffDays(dates.start, min) > 0) min = dates.start;
      if (dates.end && diffDays(max, dates.end) < 0) max = dates.end;
      if (!dates.end && diffDays(max, dates.start) < 0) max = dates.start;
    }
    const start = addDaysISO(min, -cfg.backDays);
    const end = addDaysISO(max, cfg.fwdDays);
    const count = Math.min(diffDays(start, end) + 1, MAX_COLUMNS);
    return { windowStart: start, columns: buildColumns(start, count, scale) };
  }, [scheduled, cfg, scale]);

  const axisWidth = columns.length * dayWidth;
  const totalWidth = TITLE_WIDTH + axisWidth;
  const todayOffset = diffDays(windowStart, todayISO());
  const todayX = todayOffset >= 0 && todayOffset < columns.length ? todayOffset * dayWidth : null;

  /** Scroll so today is roughly centered. */
  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el || todayX === null) return;
    el.scrollLeft = Math.max(0, TITLE_WIDTH + todayX - el.clientWidth / 2);
  };

  useEffect(() => {
    scrollToToday();
    // Center today on mount, database switch, and scale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, database.id]);

  const editingRow = database.rows.find((r) => r.id === editingRowId) ?? null;

  const barDatesFor = (rowId: string, fallback: BarDates): BarDates =>
    preview && preview.rowId === rowId ? preview.dates : fallback;

  /* --- drag handling (pointer events, local preview, commit on release) --- */

  const beginDrag = (e: React.PointerEvent, rowId: string, mode: DragMode, dates: BarDates) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      rowId,
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      origStart: dates.start,
      origEnd: dates.end,
      moved: false,
    });
    setPreview({ rowId, dates });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 4) return;
    const delta = Math.round(dx / dayWidth);
    const duration = drag.origEnd ? diffDays(drag.origStart, drag.origEnd) : 0;
    let start = drag.origStart;
    let end: string | null = drag.origEnd;
    if (drag.mode === 'move') {
      start = addDaysISO(drag.origStart, delta);
      end = drag.origEnd ? addDaysISO(drag.origStart, delta + duration) : null;
    } else if (drag.mode === 'start') {
      // Start edge moves; the end stays put and never gets crossed.
      const clamped = drag.origEnd ? Math.min(delta, duration) : delta;
      start = addDaysISO(drag.origStart, clamped);
      end = drag.origEnd;
    } else if (drag.mode === 'end' && drag.origEnd) {
      // End edge never crosses the start.
      end = addDaysISO(drag.origEnd, Math.max(delta, -duration));
    }
    setDrag({ ...drag, moved: true });
    setPreview({ rowId: drag.rowId, dates: { start, end } });
  };

  const endDrag = () => {
    if (!drag) return;
    const final = preview && preview.rowId === drag.rowId ? preview.dates : null;
    const wasMove = drag.moved;
    const rowId = drag.rowId;
    setDrag(null);
    setPreview(null);
    if (wasMove && final) {
      reschedule(rowId, final.start, final.end);
    } else {
      // A press without movement is a click — open the row editor.
      setEditingRowId(rowId);
    }
  };

  /** Keyboard nudge: arrows move the bar a day, preserving duration. */
  const nudge = (rowId: string, dates: BarDates, delta: number) => {
    const start = addDaysISO(dates.start, delta);
    const end = dates.end ? addDaysISO(dates.end, delta) : null;
    reschedule(rowId, start, end);
  };

  // No date property at all — explain and point at the table view.
  if (!startProp) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-card border border-hairline bg-paper-deep">
          <CalendarDays className="h-5 w-5 text-ink-faint" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl text-ink">Timeline needs a date column</h2>
          <p className="mt-1 max-w-sm font-sans text-sm text-ink-soft">
            Bars stretch between a start and an end date. Add a date column in
            the table view to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header: scale selector, property selectors, add item */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-0.5 rounded-control border border-hairline bg-paper p-0.5"
          role="radiogroup"
          aria-label="Timeline scale"
        >
          {SCALES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={scale === s.id}
              onClick={() => setScale(s.id)}
              className={cn(
                'rounded-[0.4rem] px-2.5 py-1 font-sans text-xs font-medium',
                'transition-colors duration-quick ease-folio',
                scale === s.id ? 'bg-accent-soft text-ink' : 'text-ink-faint hover:text-ink',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={scrollToToday} disabled={todayX === null}>
          Today
        </Button>
        {dateProps.length > 1 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-sans text-xs text-ink-faint">
              Start
              <select
                aria-label="Timeline start column"
                value={startProp.id}
                onChange={(e) =>
                  onChange({ ...database, timelineStartProp: e.target.value, updatedAt: Date.now() })
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
            <label className="flex items-center gap-2 font-sans text-xs text-ink-faint">
              End
              <select
                aria-label="Timeline end column"
                value={endProp?.id ?? ''}
                onChange={(e) =>
                  onChange({
                    ...database,
                    timelineEndProp: e.target.value === '' ? null : e.target.value,
                    updatedAt: Date.now(),
                  })
                }
                className="rounded-control border border-hairline bg-paper px-2 py-1.5 font-sans text-xs text-ink outline-none focus-visible:border-accent"
              >
                <option value="">None (milestones)</option>
                {dateProps.map((p: PropertyDef) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={addItem}
          className={dateProps.length > 1 ? '' : 'ml-auto'}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New item
        </Button>
      </div>

      {/* Unscheduled strip */}
      {unscheduled.length > 0 && (
        <section
          aria-label="Unscheduled items"
          className="mb-4 rounded-card border border-hairline bg-paper-deep/60 p-3"
        >
          <p className="mb-2 font-sans text-xs font-medium text-ink-faint">
            Unscheduled — {unscheduled.length} item{unscheduled.length === 1 ? '' : 's'} with
            no {startProp.name.toLowerCase()} date
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
                  aria-label={`Set ${startProp.name} for ${rowTitle(database, row)}`}
                  value=""
                  onChange={(e) => {
                    if (isDateCell(e.target.value)) {
                      setCell(row.id, startProp.id, e.target.value);
                    }
                  }}
                  className="h-6 w-auto border-transparent px-1 py-0 font-sans text-xs text-ink-faint"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Gantt grid */}
      <div
        ref={scrollRef}
        className="folio-scroll overflow-x-auto rounded-card border border-hairline bg-paper shadow-glass"
      >
        <div style={{ width: totalWidth }}>
          <div className="flex">
            {/* Sticky title column */}
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-hairline bg-paper"
              style={{ width: TITLE_WIDTH }}
            >
              <div className="h-14 border-b border-hairline" aria-hidden />
              {scheduled.map(({ row, dates }) => (
                <div
                  key={row.id}
                  className="flex flex-col justify-center border-b border-hairline/60 px-3"
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    onClick={() => setEditingRowId(row.id)}
                    className="truncate text-left font-sans text-sm font-medium text-ink hover:text-accent"
                    title={rowTitle(database, row)}
                  >
                    {rowTitle(database, row)}
                  </button>
                  <span className="truncate font-sans text-[11px] tabular-nums text-ink-faint">
                    {dates.end && dates.end !== dates.start
                      ? `${dates.start} → ${dates.end}`
                      : dates.start}
                  </span>
                </div>
              ))}
            </div>

            {/* Time axis + bars */}
            <div className="relative" style={{ width: axisWidth }}>
              {/* Axis header */}
              <div className="sticky top-0 z-10 h-14 border-b border-hairline bg-paper">
                <div className="flex h-6 items-stretch">
                  {groupSpans(columns).map((g, i) => (
                    <div
                      key={`${g.label}-${i}`}
                      className="flex items-center overflow-hidden border-l border-hairline px-2 first:border-l-0"
                      style={{ width: g.days * dayWidth }}
                    >
                      <span className="truncate font-sans text-[11px] font-medium text-ink-faint">
                        {g.label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex h-8 items-stretch">
                  {columns.map((c) => (
                    <div
                      key={c.iso}
                      className={cn(
                        'flex items-center justify-center border-l border-hairline/60 font-sans text-[11px] tabular-nums first:border-l-0',
                        c.isToday ? 'font-semibold text-accent' : 'text-ink-faint',
                      )}
                      style={{ width: dayWidth }}
                      title={c.iso}
                    >
                      {c.detail}
                    </div>
                  ))}
                </div>
              </div>

              {/* Bars area */}
              <div className="relative" style={{ height: scheduled.length * ROW_HEIGHT }}>
                {/* Day grid lines */}
                {dayWidth >= 20 && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 text-hairline/60"
                    style={{
                      backgroundImage: `repeating-linear-gradient(to right, currentColor 0 1px, transparent 1px ${dayWidth}px)`,
                    }}
                  />
                )}
                {/* Month-start lines for the dense quarter scale */}
                {dayWidth < 20 &&
                  columns.map(
                    (c, i) =>
                      c.isMonthStart && (
                        <div
                          key={c.iso}
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 w-px bg-hairline/70"
                          style={{ left: i * dayWidth }}
                        />
                      ),
                  )}
                {/* Weekend shading on the readable week scale */}
                {scale === 'week' &&
                  columns.map(
                    (c, i) =>
                      c.isWeekend && (
                        <div
                          key={c.iso}
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 bg-ink/[0.025]"
                          style={{ left: i * dayWidth, width: dayWidth }}
                        />
                      ),
                  )}
                {/* Row separators */}
                {scheduled.map(({ row }, i) => (
                  <div
                    key={row.id}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-b border-hairline/60"
                    style={{ top: (i + 1) * ROW_HEIGHT - 1, height: 1 }}
                  />
                ))}
                {/* Today line */}
                {todayX !== null && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-accent"
                    style={{ left: todayX }}
                    title="Today"
                  />
                )}
                {/* Bars */}
                {scheduled.map(({ row, dates }, i) => {
                  const d = barDatesFor(row.id, dates);
                  const x = diffDays(windowStart, d.start) * dayWidth;
                  const spanDays = d.end ? diffDays(d.start, d.end) + 1 : 1;
                  const width = Math.max(spanDays * dayWidth, d.end ? 8 : 0);
                  const isMilestone = d.end === null;
                  const dragging = drag?.rowId === row.id;
                  const title = `${rowTitle(database, row)} — ${
                    d.end && d.end !== d.start ? `${d.start} to ${d.end}` : d.start
                  }`;
                  return (
                    <div key={row.id} className="absolute inset-x-0" style={{ top: i * ROW_HEIGHT }}>
                      {isMilestone ? (
                        <button
                          aria-label={title}
                          title={title}
                          onPointerDown={(e) => beginDrag(e, row.id, 'move', d)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={() => {
                            setDrag(null);
                            setPreview(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditingRowId(row.id);
                            else if (e.key === 'ArrowLeft') nudge(row.id, d, -1);
                            else if (e.key === 'ArrowRight') nudge(row.id, d, 1);
                          }}
                          className={cn(
                            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] bg-accent shadow-glass',
                            'cursor-grab outline-none transition-transform duration-quick ease-folio hover:scale-125 focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing',
                            dragging && 'scale-125 opacity-70',
                          )}
                          style={{ left: x, touchAction: 'none' }}
                        />
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${title}. Press Enter to edit, arrow keys to move.`}
                          title={title}
                          onPointerDown={(e) => beginDrag(e, row.id, 'move', d)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={() => {
                            setDrag(null);
                            setPreview(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditingRowId(row.id);
                            else if (e.key === 'ArrowLeft') nudge(row.id, d, -1);
                            else if (e.key === 'ArrowRight') nudge(row.id, d, 1);
                          }}
                          className={cn(
                            'group absolute flex cursor-grab items-center overflow-hidden rounded-[6px] bg-accent/80 shadow-glass outline-none',
                            'transition-colors duration-quick ease-folio hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing',
                            dragging && 'bg-accent opacity-70',
                          )}
                          style={{
                            left: x,
                            top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                            width,
                            height: BAR_HEIGHT,
                            touchAction: 'none',
                          }}
                        >
                          {/* Resize handles */}
                          <span
                            role="presentation"
                            aria-hidden
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              beginDrag(e, row.id, 'start', d);
                            }}
                            className="h-full w-2.5 shrink-0 cursor-ew-resize rounded-l-[6px] bg-accent-ink/0 transition-colors group-hover:bg-accent-ink/25"
                          />
                          <span className="pointer-events-none min-w-0 flex-1 truncate px-1 font-sans text-[11px] font-medium text-accent-ink">
                            {width > 40 ? rowTitle(database, row) : ''}
                          </span>
                          <span
                            role="presentation"
                            aria-hidden
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              beginDrag(e, row.id, 'end', d);
                            }}
                            className="h-full w-2.5 shrink-0 cursor-ew-resize rounded-r-[6px] bg-accent-ink/0 transition-colors group-hover:bg-accent-ink/25"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {scheduled.length === 0 && (
                  <p className="absolute inset-0 flex items-center justify-center font-sans text-sm text-ink-faint">
                    Nothing scheduled yet — add an item or set a {startProp.name.toLowerCase()}{' '}
                    date in the table view.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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

/** Consecutive columns sharing a group label, for the grouped axis row. */
function groupSpans(columns: TimelineColumn[]): { label: string; days: number }[] {
  const spans: { label: string; days: number }[] = [];
  for (const c of columns) {
    const last = spans[spans.length - 1];
    if (last && last.label === c.group) last.days += 1;
    else spans.push({ label: c.group, days: 1 });
  }
  return spans;
}
