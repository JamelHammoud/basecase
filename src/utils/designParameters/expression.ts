import { PARAMETER_LIMITS, type ParameterUnit, type Quantity } from './types';

interface Token {
  text: string;
  start: number;
  end: number;
}

type Node =
  | { kind: 'literal'; quantity: Quantity }
  | { kind: 'name'; name: string }
  | { kind: 'unary'; sign: number; child: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node };

const UNITS = new Set(['mm', 'deg']);
const RESERVED = new Set(['mm', 'deg', 'constructor', 'prototype', '__proto__']);
const IDENTIFIER = /^[A-Za-z_]\w*$/;
const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export const parameterName = (name: unknown): name is string =>
  typeof name === 'string' && name.length <= 48 && IDENTIFIER.test(name) && !RESERVED.has(name);

function tokensOf(expression: string): Token[] {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > PARAMETER_LIMITS.expression)
    throw new Error('Use an expression of 1 to 256 characters.');

  const tokens: Token[] = [];
  const pattern = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[()+*/-]/y;
  let offset = 0;

  while (offset < expression.length) {
    pattern.lastIndex = offset;

    const match = pattern.exec(expression);

    if (!match) throw new Error(`Expression can’t use ${expression.slice(offset, offset + 12)}.`);

    offset = pattern.lastIndex;

    if (!match[0].trim()) continue;

    tokens.push({ text: match[0], start: match.index, end: offset });

    if (tokens.length > PARAMETER_LIMITS.tokens) throw new Error('Use at most 64 expression tokens.');
  }

  return tokens;
}

const finite = (quantity: Quantity): Quantity => {
  if (!Number.isFinite(quantity.value)) throw new Error('Expression must produce a finite number.');

  return quantity;
};

class Parser {
  private index = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek() {
    return this.tokens[this.index]?.text;
  }

  parse(): Node {
    const node = this.sum(0);

    if (this.index !== this.tokens.length) throw new Error(`Unexpected expression token ${this.peek()}.`);

    return node;
  }

  private sum(depth: number): Node {
    let left = this.product(depth);

    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.tokens[this.index++].text;

      left = { kind: 'binary', op, left, right: this.product(depth) };
    }

    return left;
  }

  private product(depth: number): Node {
    let left = this.atom(depth);

    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.tokens[this.index++].text;

      left = { kind: 'binary', op, left, right: this.atom(depth) };
    }

    return left;
  }

  private atom(depth: number): Node {
    if (depth >= PARAMETER_LIMITS.depth) throw new Error('Expression nesting exceeds 16 levels.');

    const token = this.tokens[this.index++]?.text;

    if (token === '+' || token === '-')
      return { kind: 'unary', sign: token === '-' ? -1 : 1, child: this.atom(depth + 1) };

    if (token === '(') return this.parenthesized(depth);

    if (token && NUMBER.test(token)) {
      const unit = UNITS.has(this.peek()) ? (this.tokens[this.index++].text as ParameterUnit) : '1';

      return { kind: 'literal', quantity: finite({ value: Number(token), unit }) };
    }

    if (parameterName(token)) return { kind: 'name', name: token };

    throw new Error('Use a number, a declared parameter or parentheses.');
  }

  private parenthesized(depth: number) {
    const node = this.sum(depth + 1);

    if (this.tokens[this.index++]?.text !== ')') throw new Error('Close the expression’s parentheses.');

    return node;
  }
}

function arithmetic(op: string, a: Quantity, b: Quantity): Quantity {
  if ((op === '+' || op === '-') && a.unit !== b.unit) throw new Error(`Cannot ${op} ${a.unit} and ${b.unit}.`);

  if (op === '+' || op === '-') {
    return finite({ unit: a.unit, value: a.value + (op === '+' ? b.value : -b.value) });
  }

  if (op === '*' && a.unit !== '1' && b.unit !== '1') throw new Error('Multiply a dimension by a unitless number.');

  if (op === '*') return finite({ unit: a.unit === '1' ? b.unit : a.unit, value: a.value * b.value });

  if (b.unit !== '1' && a.unit !== b.unit) throw new Error(`Cannot divide ${a.unit} by ${b.unit}.`);

  return finite({ unit: b.unit === '1' ? a.unit : '1', value: a.value / b.value });
}

function namedQuantity(name: string, values: ReadonlyMap<string, Quantity>): Quantity {
  const found = values.get(name);

  if (!found) throw new Error(`Declare parameter ${name}.`);

  return finite(found);
}

function evaluate(node: Node, values: ReadonlyMap<string, Quantity>, depth: number): Quantity {
  if (depth > PARAMETER_LIMITS.tokens) throw new Error('Expression exceeds its evaluation limit.');

  if (node.kind === 'literal') return node.quantity;

  if (node.kind === 'name') return namedQuantity(node.name, values);

  if (node.kind === 'unary') {
    const child = evaluate(node.child, values, depth + 1);

    return finite({ ...child, value: node.sign * child.value });
  }

  return arithmetic(node.op, evaluate(node.left, values, depth + 1), evaluate(node.right, values, depth + 1));
}

export function evaluateExpression(expression: string, values: ReadonlyMap<string, Quantity>): Quantity {
  return evaluate(new Parser(tokensOf(expression)).parse(), values, 0);
}

export function expressionNames(expression: string): string[] {
  const tokens = tokensOf(expression);

  new Parser(tokens).parse();

  return [...new Set(tokens.filter((token) => parameterName(token.text)).map((token) => token.text))];
}

export function renameExpression(expression: string, before: string, after: string): string {
  if (!parameterName(after)) throw new Error('Use a parameter name with letters, numbers and underscores.');

  return substituteExpression(expression, before, after);
}

export function substituteExpression(expression: string, before: string, after: string): string {
  const tokens = tokensOf(expression).filter((token) => token.text === before);
  let renamed = expression;

  for (const token of tokens.toReversed()) renamed = renamed.slice(0, token.start) + after + renamed.slice(token.end);

  return renamed;
}
