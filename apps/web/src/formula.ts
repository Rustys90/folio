/**
 * formula.ts — clean-room formula expression language for database columns.
 *
 * No eval(), no Function constructor, no access to globals. Expressions are
 * tokenized, parsed into an AST with a recursive-descent parser, then
 * evaluated by a bounded interpreter:
 *  - parser rejects oversized input and ASTs (node budget)
 *  - the evaluator has a step budget (timeout guard for pathological input)
 *    and a recursion depth limit
 *  - `prop("Name")` resolves other properties by name, with circular
 *    references reported as errors instead of infinite loops
 */

import type {
  CellValue,
  DatabaseRow,
  FolioDatabase,
  PropertyDef,
} from './database-types';
import { computeRollup, isFormulaProperty, isRollupProperty, relationIds } from './database-types';

/** The values a formula can produce. Dates surface as ISO strings. */
export type FormulaValue = number | string | boolean | undefined;

export interface FormulaResult {
  value: FormulaValue;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

const MAX_EXPRESSION_LENGTH = 5000;
const MAX_AST_NODES = 2000;
const MAX_EVAL_STEPS = 100_000;
const MAX_EVAL_DEPTH = 64;

class FormulaSyntaxError extends Error {}

function tokenize(input: string): Token[] {
  if (input.length > MAX_EXPRESSION_LENGTH) {
    throw new FormulaSyntaxError('Expression is too long');
  }
  const tokens: Token[] = [];
  let i = 0;
  const twoCharOps = ['==', '!=', '>=', '<='];
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let out = '';
      while (j < input.length && input[j] !== ch) {
        if (input[j] === '\\' && j + 1 < input.length) {
          const esc = input[j + 1]!;
          out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
          j += 2;
        } else {
          out += input[j];
          j += 1;
        }
      }
      if (j >= input.length) {
        throw new FormulaSyntaxError('Unterminated string literal');
      }
      tokens.push({ kind: 'str', value: out });
      i = j + 1;
      continue;
    }
    const numMatch = /^[0-9]+(\.[0-9]+)?/.exec(input.slice(i));
    if (numMatch) {
      tokens.push({ kind: 'num', value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    const identMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
    if (identMatch) {
      tokens.push({ kind: 'ident', name: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (twoCharOps.includes(two)) {
      tokens.push({ kind: 'op', op: two });
      i += 2;
      continue;
    }
    if ('+-*/%><'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i += 1;
      continue;
    }
    throw new FormulaSyntaxError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

/* ------------------------------------------------------------------ */
/* AST                                                                 */
/* ------------------------------------------------------------------ */

export type AstNode =
  | { kind: 'literal'; value: number | string | boolean }
  | { kind: 'prop'; name: string }
  | { kind: 'unary'; op: 'not' | 'neg'; operand: AstNode }
  | { kind: 'binary'; op: string; left: AstNode; right: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] };

class Parser {
  private pos = 0;
  private nodeCount = 0;

  constructor(private readonly tokens: Token[]) {}

  private node<T extends AstNode>(n: T): T {
    this.nodeCount += 1;
    if (this.nodeCount > MAX_AST_NODES) {
      throw new FormulaSyntaxError('Expression is too complex');
    }
    return n;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new FormulaSyntaxError('Unexpected end of expression');
    this.pos += 1;
    return t;
  }

  private expect(kind: Token['kind'], what: string): Token {
    const t = this.next();
    if (t.kind !== kind) {
      throw new FormulaSyntaxError(`Expected ${what}`);
    }
    return t;
  }

  parse(): AstNode {
    const expr = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new FormulaSyntaxError('Unexpected input after expression');
    }
    return expr;
  }

  private parseOr(): AstNode {
    let left = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'ident' && t.name.toLowerCase() === 'or') {
        this.next();
        left = this.node({ kind: 'binary', op: 'or', left, right: this.parseAnd() });
      } else {
        return left;
      }
    }
  }

  private parseAnd(): AstNode {
    let left = this.parseComparison();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'ident' && t.name.toLowerCase() === 'and') {
        this.next();
        left = this.node({
          kind: 'binary',
          op: 'and',
          left,
          right: this.parseComparison(),
        });
      } else {
        return left;
      }
    }
  }

  private parseComparison(): AstNode {
    let left = this.parseAdditive();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.op)) {
        this.next();
        left = this.node({
          kind: 'binary',
          op: t.op,
          left,
          right: this.parseAdditive(),
        });
      } else {
        return left;
      }
    }
  }

  private parseAdditive(): AstNode {
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
        this.next();
        left = this.node({
          kind: 'binary',
          op: t.op,
          left,
          right: this.parseMultiplicative(),
        });
      } else {
        return left;
      }
    }
  }

  private parseMultiplicative(): AstNode {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && (t.op === '*' || t.op === '/' || t.op === '%')) {
        this.next();
        left = this.node({
          kind: 'binary',
          op: t.op,
          left,
          right: this.parseUnary(),
        });
      } else {
        return left;
      }
    }
  }

  private parseUnary(): AstNode {
    const t = this.peek();
    if (t?.kind === 'ident' && t.name.toLowerCase() === 'not') {
      this.next();
      return this.node({
        kind: 'unary',
        op: 'not',
        operand: this.parseUnary(),
      });
    }
    if (t?.kind === 'op' && t.op === '-') {
      this.next();
      return this.node({ kind: 'unary', op: 'neg', operand: this.parseUnary() });
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const t = this.next();
    if (t.kind === 'num' || t.kind === 'str') {
      return this.node({ kind: 'literal', value: t.value });
    }
    if (t.kind === 'ident') {
      const lower = t.name.toLowerCase();
      if (lower === 'true') return this.node({ kind: 'literal', value: true });
      if (lower === 'false') return this.node({ kind: 'literal', value: false });
      const ahead = this.peek();
      if (ahead?.kind === 'lparen') {
        this.next();
        const args: AstNode[] = [];
        if (this.peek()?.kind !== 'rparen') {
          for (;;) {
            args.push(this.parseOr());
            const sep = this.peek();
            if (sep?.kind === 'comma') {
              this.next();
              continue;
            }
            break;
          }
        }
        this.expect('rparen', '")"');
        return this.node({ kind: 'call', name: lower, args });
      }
      throw new FormulaSyntaxError(
        `Unknown identifier "${t.name}" — did you mean prop("${t.name}")?`,
      );
    }
    if (t.kind === 'lparen') {
      const expr = this.parseOr();
      this.expect('rparen', '")"');
      return expr;
    }
    throw new FormulaSyntaxError('Expected a value, property, or function');
  }
}

/** Parsed expressions are cached: the same column text parses once per session. */
const parseCache = new Map<string, AstNode | FormulaSyntaxError>();

function parseCached(expression: string): AstNode | FormulaSyntaxError {
  const hit = parseCache.get(expression);
  if (hit) return hit;
  let result: AstNode | FormulaSyntaxError;
  try {
    result = new Parser(tokenize(expression)).parse();
  } catch (e) {
    result =
      e instanceof FormulaSyntaxError
        ? e
        : new FormulaSyntaxError('Could not parse expression');
  }
  // Bound the cache: formulas are per-column, so this stays small.
  if (parseCache.size > 1000) parseCache.clear();
  parseCache.set(expression, result);
  return result;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

class FormulaEvalError extends Error {}

interface EvalContext {
  database: FolioDatabase;
  row: DatabaseRow;
  databases: FolioDatabase[];
  /** Ids of formula properties already being evaluated up the call stack. */
  formulaStack: string[];
  steps: number;
}

function budget(ctx: EvalContext, depth: number): void {
  ctx.steps += 1;
  if (ctx.steps > MAX_EVAL_STEPS) {
    throw new FormulaEvalError('Evaluation timed out');
  }
  if (depth > MAX_EVAL_DEPTH) {
    throw new FormulaEvalError('Expression is nested too deeply');
  }
}

function isTruthy(v: FormulaValue): boolean {
  if (v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  return v !== '';
}

function toNumber(v: FormulaValue, what: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  throw new FormulaEvalError(`${what} expects a number`);
}

function toDate(v: FormulaValue, what: string): Date {
  if (typeof v !== 'string') {
    throw new FormulaEvalError(`${what} expects a date`);
  }
  const d =
    /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new FormulaEvalError(`${what} expects a date`);
  }
  return d;
}

/**
 * Convert a stored cell into a formula value. Numbers stay numbers; strings
 * that parse as numbers become numbers (so `prop("Price") * prop("Qty")`
 * works when the values were typed in); relation cells count their links;
 * empty cells are undefined and propagate as "no result".
 */
function cellToFormulaValue(value: CellValue): FormulaValue {
  if (value === undefined || value === '') return undefined;
  if (Array.isArray(value)) return relationIds(value).length;
  if (typeof value === 'number') return value;
  const n = Number(value);
  if (value.trim() !== '' && Number.isFinite(n)) return n;
  return value;
}

function resolvePropRef(
  name: string,
  ctx: EvalContext,
): FormulaValue {
  const target = ctx.database.properties.find((p) => p.name === name);
  if (!target) {
    throw new FormulaEvalError(`Unknown property "${name}"`);
  }
  if (isFormulaProperty(target)) {
    if (ctx.formulaStack.includes(target.id)) {
      const chain = [...ctx.formulaStack, target.id]
        .map(
          (id) =>
            ctx.database.properties.find((p) => p.id === id)?.name ?? id,
        )
        .join(' → ');
      throw new FormulaEvalError(`Circular reference: ${chain}`);
    }
    const res = computeFormula(
      target,
      ctx.database,
      ctx.row,
      ctx.databases,
      ctx.formulaStack,
    );
    if (res.error) throw new FormulaEvalError(res.error);
    return res.value;
  }
  if (isRollupProperty(target)) {
    return computeRollup(target, ctx.database, ctx.row, ctx.databases);
  }
  return cellToFormulaValue(ctx.row.cells[target.id]);
}

const DAY_MS = 86_400_000;

function callFunction(
  name: string,
  args: AstNode[],
  ctx: EvalContext,
  depth: number,
): FormulaValue {
  const evalArg = (n: AstNode) => evaluate(n, ctx, depth + 1);
  switch (name) {
    case 'prop': {
      if (args.length !== 1) throw new FormulaEvalError('prop() takes 1 argument');
      const propName = evalArg(args[0]!);
      if (typeof propName !== 'string') {
        throw new FormulaEvalError('prop() expects a property name');
      }
      return resolvePropRef(propName, ctx);
    }
    case 'if': {
      if (args.length !== 3) throw new FormulaEvalError('if() takes 3 arguments');
      // Lazy: only the taken branch evaluates (avoids erroring branches).
      return isTruthy(evalArg(args[0]!)) ? evalArg(args[1]!) : evalArg(args[2]!);
    }
    case 'len': {
      if (args.length !== 1) throw new FormulaEvalError('len() takes 1 argument');
      const v = evalArg(args[0]!);
      if (v === undefined) return undefined;
      return String(v).length;
    }
    case 'round': {
      if (args.length !== 1) throw new FormulaEvalError('round() takes 1 argument');
      const v = evalArg(args[0]!);
      if (v === undefined) return undefined;
      return Math.round(toNumber(v, 'round()'));
    }
    case 'abs': {
      if (args.length !== 1) throw new FormulaEvalError('abs() takes 1 argument');
      const v = evalArg(args[0]!);
      if (v === undefined) return undefined;
      return Math.abs(toNumber(v, 'abs()'));
    }
    case 'min':
    case 'max': {
      if (args.length !== 2) {
        throw new FormulaEvalError(`${name}() takes 2 arguments`);
      }
      const a = evalArg(args[0]!);
      const b = evalArg(args[1]!);
      if (a === undefined || b === undefined) return undefined;
      const [na, nb] = [toNumber(a, `${name}()`), toNumber(b, `${name}()`)];
      return name === 'min' ? Math.min(na, nb) : Math.max(na, nb);
    }
    case 'today': {
      if (args.length !== 0) throw new FormulaEvalError('today() takes no arguments');
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
    }
    case 'datebetween': {
      if (args.length !== 3) {
        throw new FormulaEvalError('dateBetween() takes 3 arguments');
      }
      const a = evalArg(args[0]!);
      const b = evalArg(args[1]!);
      const unit = evalArg(args[2]!);
      if (a === undefined || b === undefined || unit === undefined) {
        return undefined;
      }
      const da = toDate(a, 'dateBetween()');
      const db = toDate(b, 'dateBetween()');
      const diffMs = db.getTime() - da.getTime();
      const u = String(unit).toLowerCase();
      if (u === 'days' || u === 'day') return Math.floor(diffMs / DAY_MS);
      if (u === 'hours' || u === 'hour') return Math.floor(diffMs / 3_600_000);
      if (u === 'minutes' || u === 'minute') return Math.floor(diffMs / 60_000);
      if (u === 'years' || u === 'year') {
        let years = db.getFullYear() - da.getFullYear();
        if (
          db.getMonth() < da.getMonth() ||
          (db.getMonth() === da.getMonth() && db.getDate() < da.getDate())
        ) {
          years -= 1;
        }
        return years;
      }
      if (u === 'months' || u === 'month') {
        let months =
          (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
        if (db.getDate() < da.getDate()) months -= 1;
        return months;
      }
      throw new FormulaEvalError(
        'dateBetween() unit must be "days", "hours", "minutes", "months", or "years"',
      );
    }
    default:
      throw new FormulaEvalError(`Unknown function "${name}()"`);
  }
}

function compareValues(op: string, a: FormulaValue, b: FormulaValue): boolean {
  const aNum = typeof a === 'number' || (typeof a === 'string' && a.trim() !== '' && Number.isFinite(Number(a)));
  const bNum = typeof b === 'number' || (typeof b === 'string' && b.trim() !== '' && Number.isFinite(Number(b)));
  if (aNum && bNum) {
    const [x, y] = [Number(a), Number(b)];
    switch (op) {
      case '==':
        return x === y;
      case '!=':
        return x !== y;
      case '>':
        return x > y;
      case '<':
        return x < y;
      case '>=':
        return x >= y;
      case '<=':
        return x <= y;
    }
  }
  const [x, y] = [String(a), String(b)];
  switch (op) {
    case '==':
      return x === y;
    case '!=':
      return x !== y;
    case '>':
      return x > y;
    case '<':
      return x < y;
    case '>=':
      return x >= y;
    case '<=':
      return x <= y;
  }
  return false;
}

function evaluate(node: AstNode, ctx: EvalContext, depth: number): FormulaValue {
  budget(ctx, depth);
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'prop':
      // Bare prop() isn't valid syntax (parser always builds calls); defensive.
      throw new FormulaEvalError('Invalid property reference');
    case 'unary': {
      const v = evaluate(node.operand, ctx, depth + 1);
      if (node.op === 'not') return !isTruthy(v);
      if (v === undefined) return undefined;
      return -toNumber(v, 'Unary minus');
    }
    case 'binary': {
      if (node.op === 'and') {
        const l = evaluate(node.left, ctx, depth + 1);
        return isTruthy(l) ? evaluate(node.right, ctx, depth + 1) : false;
      }
      if (node.op === 'or') {
        const l = evaluate(node.left, ctx, depth + 1);
        return isTruthy(l) ? true : evaluate(node.right, ctx, depth + 1);
      }
      const l = evaluate(node.left, ctx, depth + 1);
      const r = evaluate(node.right, ctx, depth + 1);
      if (l === undefined || r === undefined) return undefined;
      if (['==', '!=', '>', '<', '>=', '<='].includes(node.op)) {
        return compareValues(node.op, l, r);
      }
      if (node.op === '+' && (typeof l === 'string' || typeof r === 'string')) {
        return `${l}${r}`;
      }
      const [a, b] = [toNumber(l, 'Arithmetic'), toNumber(r, 'Arithmetic')];
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return b === 0 ? undefined : a / b;
        case '%':
          return b === 0 ? undefined : a % b;
      }
      throw new FormulaEvalError(`Unknown operator "${node.op}"`);
    }
    case 'call':
      return callFunction(node.name, node.args, ctx, depth);
  }
}

/**
 * Compute a formula value for one row, mirroring the `computeRollup` pattern.
 *
 * Never throws: parse failures, unknown properties, circular references,
 * and evaluation guards all surface as `{ value, error }` so cells can show
 * the error inline. `formulaStack` tracks the chain of formula properties
 * being evaluated (for nested `prop()` calls); callers should omit it.
 */
export function computeFormula(
  property: PropertyDef,
  db: FolioDatabase,
  row: DatabaseRow,
  databases: FolioDatabase[],
  formulaStack: string[] = [],
): FormulaResult {
  if (!isFormulaProperty(property)) {
    return { value: undefined, error: 'Not a formula property' };
  }
  const expression = (property.formulaExpression ?? '').trim();
  if (!expression) {
    return { value: undefined, error: 'Empty formula' };
  }
  const parsed = parseCached(expression);
  if (parsed instanceof FormulaSyntaxError) {
    return { value: undefined, error: parsed.message };
  }
  const ctx: EvalContext = {
    database: db,
    row,
    databases,
    formulaStack: [...formulaStack, property.id],
    steps: 0,
  };
  try {
    return { value: evaluate(parsed, ctx, 0) };
  } catch (e) {
    if (e instanceof FormulaEvalError) {
      return { value: undefined, error: e.message };
    }
    return { value: undefined, error: 'Could not evaluate formula' };
  }
}

/**
 * Format a formula result for display. Integers plain, fractions trimmed to
 * 2 decimals, booleans as True/False, undefined as an em dash.
 */
export function formatFormulaResult(result: FormulaResult): string {
  if (result.error) return result.error;
  const v = result.value;
  if (v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return v
      .toFixed(2)
      .replace(/0+$/, '')
      .replace(/\.$/, '');
  }
  return v;
}

/** Short function reference shown under the formula editor. */
export const FORMULA_FUNCTIONS: { signature: string; description: string }[] = [
  { signature: 'prop("Name")', description: 'Value of another property' },
  { signature: 'if(cond, a, b)', description: 'a when cond is true, else b' },
  { signature: 'len(text)', description: 'Length of text' },
  { signature: 'round(n)', description: 'Round to the nearest integer' },
  { signature: 'abs(n)', description: 'Absolute value' },
  { signature: 'min(a, b)', description: 'Smaller of two numbers' },
  { signature: 'max(a, b)', description: 'Larger of two numbers' },
  { signature: 'today()', description: "Today's date (YYYY-MM-DD)" },
  {
    signature: 'dateBetween(a, b, "days")',
    description: 'Days (or hours, months, years) from a to b',
  },
];

/** Example formulas offered in the editor for one-click insert. */
export const FORMULA_EXAMPLES: string[] = [
  'prop("Price") * prop("Qty")',
  'if(prop("Qty") > 10, "Bulk", "Single")',
  'round(prop("Price") * 1.2)',
  'dateBetween(prop("Start"), today(), "days")',
];
