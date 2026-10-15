/** Database (table / kanban) types for Folio. */

export type PropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'date'
  | 'relation'
  | 'rollup';
export type DatabaseView = 'table' | 'kanban' | 'calendar' | 'gallery';

/** Aggregation a rollup property computes over its linked rows. */
export type RollupFn = 'count' | 'sum' | 'avg' | 'min' | 'max';

export const ROLLUP_FNS: { fn: RollupFn; label: string }[] = [
  { fn: 'count', label: 'Count' },
  { fn: 'sum', label: 'Sum' },
  { fn: 'avg', label: 'Average' },
  { fn: 'min', label: 'Min' },
  { fn: 'max', label: 'Max' },
];

/**
 * A column definition.
 *
 * `options` only applies to `select` properties. `relation*` only applies to
 * `relation` properties; `rollup*` only applies to `rollup` properties.
 * Databases serialized before relations existed simply omit these fields —
 * every helper below treats a missing field as "not configured".
 */
export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  options?: string[];
  /** Relation: id of the database this property links to. */
  relationDatabaseId?: string;
  /**
   * Relation: id of the reverse relation property on the target database,
   * when a two-way relation was created. Informational — the reverse link
   * works even when this is absent.
   */
  relationPropertyId?: string;
  /** Rollup: id of the relation property (on this database) the rollup follows. */
  rollupRelationId?: string;
  /** Rollup: id of the property on the target database to aggregate. */
  rollupPropertyId?: string;
  /** Rollup: the aggregation to compute. */
  rollupFn?: RollupFn;
}

/**
 * A stored cell value. Select and date values are strings; relation values
 * are arrays of target row ids; empty cells are undefined.
 */
export type CellValue = string | number | string[] | undefined;

export interface DatabaseRow {
  id: string;
  cells: Record<string, CellValue>;
}

export interface FolioDatabase {
  id: string;
  title: string;
  /** Emoji icon shown in the sidebar and top bar. */
  icon: string;
  properties: PropertyDef[];
  rows: DatabaseRow[];
  view: DatabaseView;
  /** Property id used to group kanban columns; must reference a `select` property. */
  kanbanGroupBy: string | null;
  /** Property id driving the calendar view; must reference a `date` property. */
  calendarDateProp: string | null;
  updatedAt: number;
}

/** Stable-enough unique id for rows and properties. */
export function newDbId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** True when the property is a relation column. Type guard for old data. */
export function isRelationProperty(prop: PropertyDef): boolean {
  return prop.type === 'relation';
}

/** True when the property is a rollup column. Type guard for old data. */
export function isRollupProperty(prop: PropertyDef): boolean {
  return prop.type === 'rollup';
}

/**
 * The row ids stored in a relation cell. Anything that isn't an array —
 * including legacy scalar values — reads as no links, never throws.
 */
export function relationIds(value: CellValue): string[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The database a relation property points at, or undefined when the
 * property isn't a relation, has no target configured, or the target was
 * deleted. Never throws on stale configuration.
 */
export function relationTarget(
  property: PropertyDef,
  databases: FolioDatabase[],
): FolioDatabase | undefined {
  if (!isRelationProperty(property) || !property.relationDatabaseId) {
    return undefined;
  }
  return databases.find((d) => d.id === property.relationDatabaseId);
}

/**
 * The target-database rows referenced by a relation cell, in the order the
 * ids are stored in the cell. Unknown ids (deleted target rows) are dropped;
 * a missing target database resolves to an empty list.
 */
export function resolveRelation(
  property: PropertyDef,
  value: CellValue,
  databases: FolioDatabase[],
): DatabaseRow[] {
  const target = relationTarget(property, databases);
  if (!target) return [];
  const ids = new Set(relationIds(value));
  if (ids.size === 0) return [];
  const byId = new Map(target.rows.map((r) => [r.id, r]));
  const rows: DatabaseRow[] = [];
  for (const id of relationIds(value)) {
    const row = byId.get(id);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Compute a rollup value for one row.
 *
 * - `count` returns the number of linked rows (0 for an empty relation).
 * - `sum` / `avg` / `min` / `max` aggregate the numeric values of the target
 *   property across linked rows; non-numeric and empty cells are skipped.
 *
 * Returns undefined when the rollup is misconfigured (missing relation,
 * target property, or target database) or when an arithmetic aggregation has
 * no numeric input. Callers render undefined as an em dash.
 */
export function computeRollup(
  property: PropertyDef,
  db: FolioDatabase,
  row: DatabaseRow,
  databases: FolioDatabase[],
): number | undefined {
  if (!isRollupProperty(property)) return undefined;
  const relationProp = db.properties.find(
    (p) => p.id === property.rollupRelationId && isRelationProperty(p),
  );
  if (!relationProp) return undefined;
  const linked = resolveRelation(
    relationProp,
    row.cells[relationProp.id],
    databases,
  );
  const fn = property.rollupFn ?? 'count';
  if (fn === 'count') return linked.length;
  if (!property.rollupPropertyId) return undefined;
  const numbers: number[] = [];
  for (const targetRow of linked) {
    const v = targetRow.cells[property.rollupPropertyId];
    if (v === undefined || v === '' || Array.isArray(v)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) numbers.push(n);
  }
  if (numbers.length === 0) return undefined;
  switch (fn) {
    case 'sum':
      return numbers.reduce((a, b) => a + b, 0);
    case 'avg':
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
  }
}

/** The property kanban cards use as their title: first text property, else first property. */
export function titleProperty(db: FolioDatabase): PropertyDef | undefined {
  return (
    db.properties.find((p) => p.type === 'text') ?? db.properties[0]
  );
}

/** The select property the kanban view groups by, if it still exists. */
export function kanbanGroupProperty(db: FolioDatabase): PropertyDef | undefined {
  return db.properties.find(
    (p) => p.id === db.kanbanGroupBy && p.type === 'select',
  );
}

/**
 * The date property the calendar view is driven by: the stored
 * `calendarDateProp` when it still references a date property, otherwise the
 * first date property. Mirrors `kanbanGroupProperty`, with a first-date
 * fallback so the calendar works even if the stored id is stale.
 */
export function calendarDateProperty(db: FolioDatabase): PropertyDef | undefined {
  const stored = db.calendarDateProp ?? null;
  const byId = stored
    ? db.properties.find((p) => p.id === stored && p.type === 'date')
    : undefined;
  return byId ?? db.properties.find((p) => p.type === 'date');
}
