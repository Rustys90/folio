/* Quick harness for the formula engine: parser + evaluator edge cases. */
import { computeFormula } from '../apps/web/src/formula';
import type { DatabaseRow, FolioDatabase, PropertyDef } from '../apps/web/src/database-types';

let pass = 0;
let fail = 0;

function dbWith(props: PropertyDef[], rows: DatabaseRow[]): FolioDatabase {
  return {
    id: 'db1',
    title: 'Test',
    icon: '🧪',
    properties: props,
    rows,
    view: 'table',
    kanbanGroupBy: null,
    calendarDateProp: null,
    timelineStartProp: null,
    timelineEndProp: null,
    updatedAt: 0,
  };
}

function check(
  label: string,
  expression: string,
  props: PropertyDef[],
  row: DatabaseRow,
  expected: { value?: unknown; errorContains?: string },
) {
  const formula: PropertyDef = {
    id: 'prop-f',
    name: 'F',
    type: 'formula',
    formulaExpression: expression,
  };
  const db = dbWith([...props, formula], [row]);
  const res = computeFormula(formula, db, row, [db]);
  const ok =
    expected.errorContains !== undefined
      ? (res.error ?? '').includes(expected.errorContains)
      : res.error === undefined && res.value === expected.value;
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`FAIL ${label}: expr=${expression}`);
    console.log(`  expected ${JSON.stringify(expected)}, got ${JSON.stringify(res)}`);
  }
}

const price: PropertyDef = { id: 'p1', name: 'Price', type: 'number' };
const qty: PropertyDef = { id: 'p2', name: 'Qty', type: 'number' };
const name: PropertyDef = { id: 'p3', name: 'Name', type: 'text' };
const start: PropertyDef = { id: 'p4', name: 'Start', type: 'date' };
const emptyProps: PropertyDef[] = [price, qty, name, start];

const row = (cells: Record<string, unknown>): DatabaseRow => ({
  id: 'r1',
  cells: cells as DatabaseRow['cells'],
});

// Arithmetic & precedence
check('multiply', 'prop("Price") * prop("Qty")', emptyProps, row({ p1: 10, p2: 3 }), { value: 30 });
check('precedence', '1 + 2 * 3', emptyProps, row({}), { value: 7 });
check('parens', '(1 + 2) * 3', emptyProps, row({}), { value: 9 });
check('unary neg', '-prop("Price")', emptyProps, row({ p1: 5 }), { value: -5 });
check('modulo', '10 % 3', emptyProps, row({}), { value: 1 });
check('div by zero', '1 / 0', emptyProps, row({}), { value: undefined });

// Comparisons & logic
check('compare', 'prop("Qty") > 2', emptyProps, row({ p2: 3 }), { value: true });
check('eq strings', 'prop("Name") == "abc"', emptyProps, row({ p3: 'abc' }), { value: true });
check('and', '1 > 0 and 2 > 3', emptyProps, row({}), { value: false });
check('or', '1 > 2 or 2 > 1', emptyProps, row({}), { value: true });
check('not', 'not (1 > 2)', emptyProps, row({}), { value: true });

// String concat
check('concat', 'prop("Name") + "!"', emptyProps, row({ p3: 'hi' }), { value: 'hi!' });
check('concat numbers-as-strings', '"n=" + 5', emptyProps, row({}), { value: 'n=5' });

// Functions
check('if true', 'if(prop("Qty") > 2, "big", "small")', emptyProps, row({ p2: 3 }), { value: 'big' });
check('if false', 'if(prop("Qty") > 9, "big", "small")', emptyProps, row({ p2: 3 }), { value: 'small' });
check('len', 'len(prop("Name"))', emptyProps, row({ p3: 'hello' }), { value: 5 });
check('round', 'round(2.6)', emptyProps, row({}), { value: 3 });
check('abs', 'abs(-4)', emptyProps, row({}), { value: 4 });
check('min', 'min(3, 9)', emptyProps, row({}), { value: 3 });
check('max', 'max(3, 9)', emptyProps, row({}), { value: 9 });
check('today shape', 'len(today())', emptyProps, row({}), { value: 10 });
check('dateBetween days', 'dateBetween("2026-10-01", "2026-10-15", "days")', emptyProps, row({}), { value: 14 });
check('dateBetween from props', 'dateBetween(prop("Start"), "2026-10-15", "days")', emptyProps, row({ p4: '2026-10-01' }), { value: 14 });
check('nested calls', 'round(abs(-2.4) * 10)', emptyProps, row({}), { value: 24 });

// Missing values propagate
check('missing prop value', 'prop("Price") * 2', emptyProps, row({}), { value: undefined });

// Errors
check('unknown property', 'prop("Nope") + 1', emptyProps, row({}), { errorContains: 'Unknown property "Nope"' });
check('syntax error', '1 +', emptyProps, row({}), { errorContains: 'Unexpected end' });
check('unknown function', 'frobnicate(1)', emptyProps, row({}), { errorContains: 'Unknown function "frobnicate()"' });
check('bad escape char', '1 $ 2', emptyProps, row({}), { errorContains: 'Unexpected character' });
check('arity', 'min(1)', emptyProps, row({}), { errorContains: 'takes 2 arguments' });
check('type error', 'abs("abc")', emptyProps, row({}), { errorContains: 'expects a number' });
check('bare identifier', 'Price + 1', emptyProps, row({ p1: 2 }), { errorContains: 'did you mean prop(' });

// Circular references
const selfRef: PropertyDef = { id: 'pf', name: 'Self', type: 'formula', formulaExpression: 'prop("Self") + 1' };
{
  const db = dbWith([selfRef], [row({})]);
  const res = computeFormula(selfRef, db, db.rows[0]!, [db]);
  if ((res.error ?? '').includes('Circular reference')) pass += 1;
  else { fail += 1; console.log(`FAIL self circular: ${JSON.stringify(res)}`); }
}
const a: PropertyDef = { id: 'pa', name: 'A', type: 'formula', formulaExpression: 'prop("B") + 1' };
const b: PropertyDef = { id: 'pb', name: 'B', type: 'formula', formulaExpression: 'prop("A") * 2' };
{
  const db = dbWith([a, b], [row({})]);
  const res = computeFormula(a, db, db.rows[0]!, [db]);
  if ((res.error ?? '').includes('Circular reference')) pass += 1;
  else { fail += 1; console.log(`FAIL mutual circular: ${JSON.stringify(res)}`); }
}

// Non-circular formula chain works
const base: PropertyDef = { id: 'pc', name: 'C', type: 'formula', formulaExpression: 'prop("Price") + 1' };
const top: PropertyDef = { id: 'pd', name: 'D', type: 'formula', formulaExpression: 'prop("C") * 10' };
{
  const db = dbWith([price, base, top], [row({ p1: 5 })]);
  const res = computeFormula(top, db, db.rows[0]!, [db]);
  if (res.value === 60 && !res.error) pass += 1;
  else { fail += 1; console.log(`FAIL chain: ${JSON.stringify(res)}`); }
}

// No globals leak: `process` etc. must not parse
check('no globals', 'process.exit(1)', emptyProps, row({}), { errorContains: 'Unexpected character' });

// Long input rejected
{
  const long = '1+'.repeat(4000);
  const f: PropertyDef = { id: 'pl', name: 'L', type: 'formula', formulaExpression: long };
  const db = dbWith([f], [row({})]);
  const res = computeFormula(f, db, db.rows[0]!, [db]);
  if (res.error) pass += 1;
  else { fail += 1; console.log('FAIL long expression accepted'); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
