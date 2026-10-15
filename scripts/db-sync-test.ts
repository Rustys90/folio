/* Test harness for the database Yjs sync layer.
 *
 * Exercises the full round trip without a browser:
 *  1. create a databases doc, write databases in, read them back
 *  2. simulate a remote peer (second doc): sync updates both ways
 *  3. subscribeDatabases delivers fresh snapshots on remote updates
 *     (this is the exact path that drives React state in useDatabasesSync)
 *  4. computed columns (formula / rollup) evaluate correctly against the
 *     Yjs-backed snapshot
 *
 * Run: npx tsx scripts/db-sync-test.ts
 */
import * as Y from 'yjs';
import {
  areDatabasesEmpty,
  createDatabasesDoc,
  readDatabases,
  subscribeDatabases,
  writeDatabases,
} from '../apps/web/src/database-sync';
import type { FolioDatabase, PropertyDef } from '../apps/web/src/database-types';
import { computeRollup } from '../apps/web/src/database-types';
import { computeFormula } from '../apps/web/src/formula';

let pass = 0;
let fail = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
  }
}

const props: PropertyDef[] = [
  { id: 'p-name', name: 'Name', type: 'text' },
  { id: 'p-price', name: 'Price', type: 'number' },
  { id: 'p-status', name: 'Status', type: 'select', options: ['Todo', 'Doing', 'Done'] },
  { id: 'p-date', name: 'Due', type: 'date' },
  { id: 'p-links', name: 'Links', type: 'relation', relationDatabaseId: 'db2' },
  { id: 'p-count', name: 'Linked count', type: 'rollup', rollupRelationId: 'p-links', rollupFn: 'count' },
  { id: 'p-total', name: 'Total', type: 'formula', formulaExpression: 'prop("Price") * 2' },
];

const db1: FolioDatabase = {
  id: 'db1',
  title: 'Projects',
  icon: '🗂️',
  properties: props,
  rows: [
    {
      id: 'r1',
      cells: {
        'p-name': 'Alpha',
        'p-price': 42,
        'p-status': 'Doing',
        'p-date': '2026-11-01',
        'p-links': ['t1', 't2'],
      },
    },
    { id: 'r2', cells: { 'p-name': 'Beta', 'p-status': 'Todo' } },
  ],
  view: 'kanban',
  kanbanGroupBy: 'p-status',
  calendarDateProp: 'p-date',
  timelineStartProp: 'p-date',
  timelineEndProp: null,
  updatedAt: 1700000000000,
};

const db2: FolioDatabase = {
  id: 'db2',
  title: 'Tasks',
  icon: '✅',
  properties: [
    { id: 'q-name', name: 'Name', type: 'text' },
    { id: 'q-cost', name: 'Cost', type: 'number' },
  ],
  rows: [
    { id: 't1', cells: { 'q-name': 'Task one', 'q-cost': 10 } },
    { id: 't2', cells: { 'q-name': 'Task two', 'q-cost': 20 } },
  ],
  view: 'table',
  kanbanGroupBy: null,
  calendarDateProp: null,
  timelineStartProp: null,
  timelineEndProp: null,
  updatedAt: 1700000000001,
};

/* 1 — write + read round trip ---------------------------------------- */
const doc = createDatabasesDoc();
check('fresh doc is empty', areDatabasesEmpty(doc));
writeDatabases(doc, [db1, db2]);
check('doc not empty after write', !areDatabasesEmpty(doc));
const back = readDatabases(doc);
check('read returns both databases', back.length === 2, `got ${back.length}`);
check('order preserved', back[0]?.id === 'db1' && back[1]?.id === 'db2');

const db1Back = back.find((d) => d.id === 'db1')!;
check('title round-trips', db1Back.title === 'Projects', db1Back.title);
check('view round-trips', db1Back.view === 'kanban');
check('kanbanGroupBy round-trips', db1Back.kanbanGroupBy === 'p-status');
check('timelineEndProp null round-trips', db1Back.timelineEndProp === null);
check('updatedAt round-trips', db1Back.updatedAt === 1700000000000);
check('all 7 properties round-trip', db1Back.properties.length === 7);
check(
  'select options round-trip',
  JSON.stringify(db1Back.properties[2]?.options) === JSON.stringify(['Todo', 'Doing', 'Done']),
);
check('relation target round-trips', db1Back.properties[4]?.relationDatabaseId === 'db2');
check(
  'rollup config round-trips',
  db1Back.properties[5]?.rollupRelationId === 'p-links' && db1Back.properties[5]?.rollupFn === 'count',
);
check(
  'formula expression round-trips',
  db1Back.properties[6]?.formulaExpression === 'prop("Price") * 2',
);
const r1 = db1Back.rows.find((r) => r.id === 'r1')!;
check('number cell round-trips', r1.cells['p-price'] === 42);
check(
  'relation cell round-trips as array',
  Array.isArray(r1.cells['p-links']) &&
    JSON.stringify(r1.cells['p-links']) === JSON.stringify(['t1', 't2']),
);
check('unset cells stay unset', r1.cells['p-total'] === undefined);
const r2 = db1Back.rows.find((r) => r.id === 'r2')!;
check('missing number cell reads undefined', r2.cells['p-price'] === undefined);

/* 2 — remote peer sync ------------------------------------------------ */
const peer = createDatabasesDoc();
Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
const peerBack = readDatabases(peer);
check('peer reads both databases', peerBack.length === 2);
// Remote edit: change a cell and add a row on the peer.
writeDatabases(peer, [
  {
    ...peerBack[1]!,
    rows: [
      ...peerBack[1]!.rows,
      { id: 't3', cells: { 'q-name': 'Task three', 'q-cost': 30 } },
    ],
  },
  {
    ...peerBack[0]!,
    rows: peerBack[0]!.rows.map((r) =>
      r.id === 'r2' ? { ...r, cells: { ...r.cells, 'p-price': 7 } } : r,
    ),
  },
]);
// Ship only the delta back (like the websocket would).
Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc)));
const merged = readDatabases(doc);
const db2Merged = merged.find((d) => d.id === 'db2')!;
check('remote-added row arrives', db2Merged.rows.some((r) => r.id === 't3'));
const db1Merged = merged.find((d) => d.id === 'db1')!;
check(
  'remote cell edit arrives',
  db1Merged.rows.find((r) => r.id === 'r2')?.cells['p-price'] === 7,
);
check('local rows survive merge', db1Merged.rows.length === 2);

// Unchanged databases are not rewritten: no update event on a no-op write.
let updates = 0;
const countUpdates = () => {
  updates += 1;
};
doc.on('update', countUpdates);
writeDatabases(doc, readDatabases(doc));
doc.off('update', countUpdates);
check('no-op write emits no update', updates === 0, `got ${updates}`);

// Deletion propagates.
writeDatabases(doc, merged.filter((d) => d.id !== 'db2'));
check('deleted database is gone', readDatabases(doc).length === 1);

/* 3 — subscription delivers snapshots (the React state path) --------- */
const subDoc = createDatabasesDoc();
writeDatabases(subDoc, [db1, db2]);
const snapshots: FolioDatabase[][] = [];
const unsubscribe = subscribeDatabases(
  subDoc,
  (dbs) => {
    snapshots.push(dbs);
  },
  20,
);
// Local burst: three writes should collapse into one notification.
writeDatabases(subDoc, [db1, db2]);
writeDatabases(subDoc, [db1, db2]);
writeDatabases(subDoc, [db1, db2]);
// Remote-style update: apply an encoded update from another doc.
const remote = createDatabasesDoc();
Y.applyUpdate(remote, Y.encodeStateAsUpdate(subDoc));
writeDatabases(remote, [
  { ...db1, title: 'Projects (renamed)' },
  db2,
]);
Y.applyUpdate(subDoc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(subDoc)));

await new Promise((resolve) => setTimeout(resolve, 150));
unsubscribe();
check('subscription fired after remote update', snapshots.length >= 1, `got ${snapshots.length}`);
const latest = snapshots[snapshots.length - 1]!;
check(
  'snapshot carries the remote change',
  latest.find((d) => d.id === 'db1')?.title === 'Projects (renamed)',
);

/* 4 — computed columns read Yjs-backed snapshots ---------------------- */
const compDoc = createDatabasesDoc();
writeDatabases(compDoc, [db1, db2]);
const [cdb1, cdb2] = readDatabases(compDoc);
const rollupProp = cdb1.properties.find((p) => p.id === 'p-count')!;
const rollup = computeRollup(rollupProp, cdb1, cdb1.rows[0]!, [cdb1, cdb2]);
check('rollup count over Yjs snapshot', rollup === 2, `got ${rollup}`);
const formulaProp = cdb1.properties.find((p) => p.id === 'p-total')!;
const formula = computeFormula(formulaProp, cdb1, cdb1.rows[0]!, [cdb1, cdb2]);
check('formula over Yjs snapshot', formula.value === 84 && !formula.error, JSON.stringify(formula));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
