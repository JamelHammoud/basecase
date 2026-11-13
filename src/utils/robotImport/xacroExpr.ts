export type XacroValue = number | string | boolean;

export class XacroError extends Error {}

type Thunk = () => XacroValue;

type Lookup = (name: string) => XacroValue | undefined;

export interface Spent {
  computed: number;
}

const MAX_EXPRESSION = 4000;
const MAX_TEXT = 1_000_000;
const MAX_COMPUTED = 16_000_000;
const TOKEN =
  /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|'([^']*)'|"([^"]*)"|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)|(\*\*|\/\/|==|!=|<=|>=|[-+*/%<>(),]))/y;

type Token = { kind: 'num'; value: number } | { kind: 'str'; value: string } | { kind: 'name' | 'op'; value: string };

function tokenize(text: string): Token[] {
  const out: Token[] = [];

  TOKEN.lastIndex = 0;

  while (TOKEN.lastIndex < text.length && text.slice(TOKEN.lastIndex).trim()) {
    const m = TOKEN.exec(text);

    if (!m) throw new XacroError(`Can’t read ${text}`);

    if (m[1] !== undefined) out.push({ kind: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ kind: 'str', value: m[2] ?? m[3] });
    else if (m[4] !== undefined) out.push({ kind: 'name', value: m[4] });
    else out.push({ kind: 'op', value: m[5] });
  }

  return out;
}

const deg = Math.PI / 180;
const num = (v: XacroValue) => {
  if (typeof v === 'string') throw new XacroError(`Not a number: ${v}`);

  return Number(v);
};

const unary = (f: (x: number) => number) => (args: XacroValue[]) => f(num(args[0]));

const FUNCTIONS = new Map<string, (args: XacroValue[]) => XacroValue>([
  ['radians', unary((x) => x * deg)],
  ['degrees', unary((x) => x / deg)],
  ['sin', unary(Math.sin)],
  ['cos', unary(Math.cos)],
  ['tan', unary(Math.tan)],
  ['asin', unary(Math.asin)],
  ['acos', unary(Math.acos)],
  ['atan', unary(Math.atan)],
  ['sqrt', unary(Math.sqrt)],
  ['fabs', unary(Math.abs)],
  ['abs', unary(Math.abs)],
  ['floor', unary(Math.floor)],
  ['ceil', unary(Math.ceil)],
  ['int', unary(Math.trunc)],
  ['float', unary((x) => x)],
  ['round', unary(Math.round)],
  ['atan2', (args) => Math.atan2(num(args[0]), num(args[1]))],
  ['pow', (args) => num(args[0]) ** num(args[1])],
  ['min', (args) => Math.min(...args.map(num))],
  ['max', (args) => Math.max(...args.map(num))],
  ['str', (args) => formatValue(args[0])],
  ['bool', (args) => truthy(args[0])],
]);

const CONSTANTS = new Map<string, XacroValue>([
  ['pi', Math.PI],
  ['e', Math.E],
  ['True', true],
  ['False', false],
  ['true', true],
  ['false', false],
]);

const builtin = (name: string) => name.replace(/^math\./, '');

export function formatValue(v: XacroValue): string {
  if (typeof v === 'boolean') return v ? 'True' : 'False';

  return String(v);
}

export function truthy(v: XacroValue): boolean {
  if (typeof v !== 'string') return !!v;

  const s = v.trim().toLowerCase();

  if (s === 'true' || s === '1') return true;

  if (s === 'false' || s === '0' || s === '') return false;

  throw new XacroError(`Not a boolean: ${v}`);
}

export function capped(text: string, spent: Spent): string {
  if (text.length > MAX_TEXT) throw new XacroError('Text too long');

  spent.computed += text.length;

  if (spent.computed > MAX_COMPUTED) throw new XacroError('Computes too much text');

  return text;
}

function add(a: XacroValue, b: XacroValue, spent: Spent): XacroValue {
  if (typeof a === 'string' && typeof b === 'string') return capped(a + b, spent);

  return num(a) + num(b);
}

const pyMod = (a: number, b: number) => ((a % b) + b) % b;

const BINARY = new Map<string, (a: XacroValue, b: XacroValue, spent: Spent) => XacroValue>([
  ['+', add],
  ['-', (a, b) => num(a) - num(b)],
  ['*', (a, b) => num(a) * num(b)],
  ['/', (a, b) => num(a) / num(b)],
  ['//', (a, b) => Math.floor(num(a) / num(b))],
  ['%', (a, b) => pyMod(num(a), num(b))],
  ['**', (a, b) => num(a) ** num(b)],
  ['==', (a, b) => a === b],
  ['!=', (a, b) => a !== b],
  ['<', (a, b) => a < b],
  ['<=', (a, b) => a <= b],
  ['>', (a, b) => a > b],
  ['>=', (a, b) => a >= b],
]);

class Parser {
  private at = 0;
  private readonly tokens: Token[];
  private readonly lookup: Lookup;
  private readonly spent: Spent;

  constructor(tokens: Token[], lookup: Lookup, spent: Spent) {
    this.tokens = tokens;
    this.lookup = lookup;
    this.spent = spent;
  }

  private peek(value: string): boolean {
    const t = this.tokens[this.at];

    return !!t && (t.kind === 'op' || t.kind === 'name') && t.value === value;
  }

  private take(value: string): boolean {
    const hit = this.peek(value);

    if (hit) this.at++;

    return hit;
  }

  private expect(value: string) {
    if (!this.take(value)) throw new XacroError(`Expected ${value}`);
  }

  parse(): Thunk {
    const out = this.ternary();

    if (this.at < this.tokens.length) throw new XacroError('Unexpected text after the expression');

    return out;
  }

  private ternary(): Thunk {
    const then = this.or();

    if (!this.take('if')) return then;

    const cond = this.or();

    this.expect('else');

    const otherwise = this.ternary();

    return () => (truthy(cond()) ? then() : otherwise());
  }

  private or(): Thunk {
    let left = this.and();

    while (this.take('or')) {
      const [a, b] = [left, this.and()];

      left = () => a() || b();
    }

    return left;
  }

  private and(): Thunk {
    let left = this.not();

    while (this.take('and')) {
      const [a, b] = [left, this.not()];

      left = () => a() && b();
    }

    return left;
  }

  private not(): Thunk {
    if (!this.take('not')) return this.comparison();

    const inner = this.not();

    return () => !truthy(inner());
  }

  private binary(ops: string[], next: () => Thunk, once = false): Thunk {
    let left = next();

    for (let op = ops.find((o) => this.peek(o)); op; op = once ? undefined : ops.find((o) => this.peek(o))) {
      this.at++;

      const [a, b, f] = [left, next(), BINARY.get(op)!];

      left = () => f(a(), b(), this.spent);
    }

    return left;
  }

  private comparison = () => this.binary(['==', '!=', '<=', '>=', '<', '>'], this.sum, true);
  private sum = (): Thunk => this.binary(['+', '-'], this.term);
  private term = (): Thunk => this.binary(['*', '//', '/', '%'], this.unary);

  private unary = (): Thunk => {
    if (this.take('-')) {
      const inner = this.unary();

      return () => -num(inner());
    }

    if (this.take('+')) return this.unary();

    return this.power();
  };

  private power(): Thunk {
    const base = this.primary();

    if (!this.take('**')) return base;

    const exp = this.unary();

    return () => num(base()) ** num(exp());
  }

  private primary(): Thunk {
    const t = this.tokens[this.at++];

    if (!t) throw new XacroError('Expression ends early');

    if (t.kind === 'num' || t.kind === 'str') return () => t.value;

    if (t.kind === 'op' && t.value === '(') {
      const inner = this.ternary();

      this.expect(')');

      return inner;
    }

    if (t.kind === 'name') return this.peek('(') ? this.call(t.value) : this.name(t.value);

    throw new XacroError(`Unexpected ${t.value}`);
  }

  private name(name: string): Thunk {
    return () => {
      const value = this.lookup(name) ?? CONSTANTS.get(builtin(name));

      if (value === undefined) throw new XacroError(`${name} isn’t defined`);

      return value;
    };
  }

  private call(name: string): Thunk {
    const f = FUNCTIONS.get(builtin(name));

    if (!f) throw new XacroError(`${name}() isn’t allowed`);

    this.expect('(');

    const args: Thunk[] = [];

    while (!this.take(')')) {
      if (args.length) this.expect(',');

      args.push(this.ternary());
    }

    return () => f(args.map((a) => a()));
  }
}

export function evaluate(text: string, lookup: Lookup, spent: Spent): XacroValue {
  if (text.length > MAX_EXPRESSION) throw new XacroError('Expression too long');

  return new Parser(tokenize(text), lookup, spent).parse()();
}
