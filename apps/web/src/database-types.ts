/** Database (table / kanban) types for Folio. */

export type PropertyType = 'text' | 'number' | 'select' | 'date';
export type DatabaseView = 'table' | 'kanban';

/** A column definition. `options` only applies to `select` properties. */
export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  options?: string[];
}

/** A stored cell value. Select and date values are strings; empty cells are undefined. */
export type CellValue = string | number | undefined;

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
  updatedAt: number;
}

/** Stable-enough unique id for rows and properties. */
export function newDbId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
