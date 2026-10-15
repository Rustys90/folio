/**
 * Yjs schema mapping for Folio databases.
 *
 * Design: Option A — ONE Yjs document holds ALL databases (room
 * `folio:databases`). The document root is a Y.Map keyed by database id;
 * each entry is a Y.Map of the database's scalar fields, with `properties`
 * as a Y.Array of Y.Maps and `rows` as a Y.Array of Y.Maps (each row carries
 * `id` plus a `cells` Y.Map). Relation cells store their id arrays as
 * Y.Array so concurrent editors can merge link edits without clobbering.
 *
 * Why one doc instead of one doc per database: databases are edited as
 * whole units, relations and rollups read across databases, and one room
 * means one connection instead of a room per database. Formula/rollup
 * columns are computed at render time and never stored — only raw cells
 * live here.
 */
import * as Y from 'yjs';
import { createFolioDoc } from '@folio/sync/doc';
import type {
  CellValue,
  DatabaseRow,
  FolioDatabase,
  PropertyDef,
} from './database-types';

/** Fixed guid so every session opens the same databases document. */
export const DATABASES_DOC_GUID = 'folio-databases';

/** Name of the root Y.Map inside the databases document. */
export const DATABASES_ROOT = 'databases';

export function createDatabasesDoc(): Y.Doc {
  return createFolioDoc(DATABASES_DOC_GUID);
}

function databasesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(DATABASES_ROOT);
}

/** True when two plain values encode identically — avoids no-op writes. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ------------------------------------------------------------------ */
/* Encoding: FolioDatabase <-> Yjs shared types                        */
/* ------------------------------------------------------------------ */

function encodePropertyDef(prop: PropertyDef): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('id', prop.id);
  map.set('name', prop.name);
  map.set('type', prop.type);
  // Optional fields are omitted when unset so old and new docs stay small
  // and decoding can fall back to undefined defaults.
  if (prop.options !== undefined) {
    const options = new Y.Array<unknown>();
    options.push(prop.options);
    map.set('options', options);
  }
  if (prop.relationDatabaseId !== undefined) map.set('relationDatabaseId', prop.relationDatabaseId);
  if (prop.relationPropertyId !== undefined) map.set('relationPropertyId', prop.relationPropertyId);
  if (prop.rollupRelationId !== undefined) map.set('rollupRelationId', prop.rollupRelationId);
  if (prop.rollupPropertyId !== undefined) map.set('rollupPropertyId', prop.rollupPropertyId);
  if (prop.rollupFn !== undefined) map.set('rollupFn', prop.rollupFn);
  if (prop.formulaExpression !== undefined) map.set('formulaExpression', prop.formulaExpression);
  return map;
}

function stringArray(value: unknown): string[] | undefined {
  if (value instanceof Y.Array) return [...value.toArray()] as string[];
  if (Array.isArray(value)) return [...value] as string[];
  return undefined;
}

function decodePropertyDef(map: Y.Map<unknown>): PropertyDef {
  const asString = (key: string): string | undefined => {
    const value = map.get(key);
    return typeof value === 'string' ? value : undefined;
  };
  return {
    id: asString('id') ?? '',
    name: asString('name') ?? '',
    type: (asString('type') as PropertyDef['type']) ?? 'text',
    options: stringArray(map.get('options')),
    relationDatabaseId: asString('relationDatabaseId'),
    relationPropertyId: asString('relationPropertyId'),
    rollupRelationId: asString('rollupRelationId'),
    rollupPropertyId: asString('rollupPropertyId'),
    rollupFn: asString('rollupFn') as PropertyDef['rollupFn'],
    formulaExpression: asString('formulaExpression'),
  };
}

/** Strings/numbers pass through; relation id arrays become Y.Array. */
function encodeCell(value: CellValue): unknown {
  if (Array.isArray(value)) {
    const array = new Y.Array<unknown>();
    array.push(value);
    return array;
  }
  // undefined removes the key — empty cells stay empty on both sides.
  return value;
}

function decodeCell(value: unknown): CellValue {
  if (value instanceof Y.Array) return [...value.toArray()] as string[];
  if (typeof value === 'string' || typeof value === 'number') return value;
  return undefined;
}

function encodeRow(row: DatabaseRow): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('id', row.id);
  const cells = new Y.Map<unknown>();
  for (const [propId, value] of Object.entries(row.cells)) {
    cells.set(propId, encodeCell(value));
  }
  map.set('cells', cells);
  return map;
}

function decodeRow(map: Y.Map<unknown>): DatabaseRow {
  const cellsValue = map.get('cells');
  const cells: Record<string, CellValue> = {};
  if (cellsValue instanceof Y.Map) {
    for (const [propId, value] of cellsValue.entries()) {
      const decoded = decodeCell(value);
      if (decoded !== undefined) cells[propId] = decoded;
    }
  }
  const id = map.get('id');
  return { id: typeof id === 'string' ? id : '', cells };
}

function encodeDatabase(db: FolioDatabase): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set('id', db.id);
  map.set('title', db.title);
  map.set('icon', db.icon);
  map.set('view', db.view);
  const properties = new Y.Array<Y.Map<unknown>>();
  properties.push(db.properties.map(encodePropertyDef));
  map.set('properties', properties);
  const rows = new Y.Array<Y.Map<unknown>>();
  rows.push(db.rows.map(encodeRow));
  map.set('rows', rows);
  map.set('kanbanGroupBy', db.kanbanGroupBy ?? null);
  map.set('calendarDateProp', db.calendarDateProp ?? null);
  map.set('timelineStartProp', db.timelineStartProp ?? null);
  map.set('timelineEndProp', db.timelineEndProp ?? null);
  map.set('updatedAt', db.updatedAt);
  return map;
}

function decodeDatabase(map: Y.Map<unknown>): FolioDatabase {
  const asString = (key: string): string | undefined => {
    const value = map.get(key);
    return typeof value === 'string' ? value : undefined;
  };
  const asNullableId = (key: string): string | null => asString(key) ?? null;
  const propertiesValue = map.get('properties');
  const rowsValue = map.get('rows');
  const properties: PropertyDef[] =
    propertiesValue instanceof Y.Array
      ? [...propertiesValue.toArray()]
          .filter((entry): entry is Y.Map<unknown> => entry instanceof Y.Map)
          .map(decodePropertyDef)
      : [];
  const rows: DatabaseRow[] =
    rowsValue instanceof Y.Array
      ? [...rowsValue.toArray()]
          .filter((entry): entry is Y.Map<unknown> => entry instanceof Y.Map)
          .map(decodeRow)
      : [];
  const updatedAt = map.get('updatedAt');
  return {
    id: asString('id') ?? '',
    title: asString('title') ?? '',
    icon: asString('icon') ?? '',
    properties,
    rows,
    view: (asString('view') as FolioDatabase['view']) ?? 'table',
    kanbanGroupBy: asNullableId('kanbanGroupBy'),
    calendarDateProp: asNullableId('calendarDateProp'),
    timelineStartProp: asNullableId('timelineStartProp'),
    timelineEndProp: asNullableId('timelineEndProp'),
    updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Document-level operations                                           */
/* ------------------------------------------------------------------ */

/**
 * Read every database from the document, in insertion order. Pure — never
 * mutates the document, so it is safe to call from subscriptions and
 * functional updaters.
 */
export function readDatabases(doc: Y.Doc): FolioDatabase[] {
  return [...databasesMap(doc).values()].map(decodeDatabase);
}

/**
 * Write the desired database list into the document, diffing per database
 * id: entries that are unchanged are left untouched (no update event), new
 * entries are inserted, and ids absent from `databases` are deleted.
 */
export function writeDatabases(doc: Y.Doc, databases: FolioDatabase[]): void {
  const map = databasesMap(doc);
  doc.transact(() => {
    const wanted = new Set(databases.map((db) => db.id));
    for (const key of [...map.keys()]) {
      if (!wanted.has(key)) map.delete(key);
    }
    for (const db of databases) {
      const previous = map.get(db.id);
      if (previous && sameJson(decodeDatabase(previous), db)) continue;
      map.set(db.id, encodeDatabase(db));
    }
  });
}

/** True when the document holds no databases yet. */
export function areDatabasesEmpty(doc: Y.Doc): boolean {
  return databasesMap(doc).size === 0;
}

/**
 * Subscribe to database changes (local and remote). The listener receives a
 * fresh plain snapshot, debounced so a burst of Yjs updates (e.g. a remote
 * sync or a multi-row paste) collapses into one notification.
 */
export function subscribeDatabases(
  doc: Y.Doc,
  listener: (databases: FolioDatabase[]) => void,
  debounceMs = 120,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    timer = null;
    listener(readDatabases(doc));
  };
  const onUpdate = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(fire, debounceMs);
  };
  doc.on('update', onUpdate);
  return () => {
    doc.off('update', onUpdate);
    if (timer !== null) clearTimeout(timer);
  };
}
