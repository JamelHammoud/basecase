class MathParser {
  private i = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  parse(): number | null {
    const result = this.parseExpr();

    this.skip();

    return this.i === this.src.length ? result : null;
  }

  private peek() {
    return this.src[this.i];
  }

  private skip() {
    while (this.src[this.i] === ' ') this.i++;
  }

  private parseNumber(): number | null {
    this.skip();

    const start = this.i;

    while (this.i < this.src.length && /[\d.]/.test(this.src[this.i])) this.i++;

    if (start === this.i) return null;

    const n = parseFloat(this.src.slice(start, this.i));

    return Number.isFinite(n) ? n : null;
  }

  private parseGroup(): number | null {
    this.i++;

    const v = this.parseExpr();

    this.skip();

    if (this.peek() !== ')') return null;

    this.i++;

    return v;
  }

  private parseFactor(): number | null {
    this.skip();

    if (this.peek() === '-') {
      this.i++;

      const v = this.parseFactor();

      return v === null ? null : -v;
    }

    if (this.peek() === '(') return this.parseGroup();

    return this.parseNumber();
  }

  private parseChain(ops: string, operand: () => number | null, apply: (op: string, l: number, r: number) => number) {
    let left = operand();

    if (left === null) return null;

    for (;;) {
      this.skip();

      const op = this.peek();

      if (op === undefined || !ops.includes(op)) return left;

      this.i++;

      const right = operand();

      if (right === null) return null;

      left = apply(op, left, right);
    }
  }

  private parseTerm(): number | null {
    return this.parseChain('*/', () => this.parseFactor(), multiplyOrDivide);
  }

  private parseExpr(): number | null {
    return this.parseChain('+-', () => this.parseTerm(), addOrSubtract);
  }
}

function multiplyOrDivide(op: string, left: number, right: number): number {
  if (op === '*') return left * right;

  return right === 0 ? left : left / right;
}

const addOrSubtract = (op: string, left: number, right: number) => (op === '+' ? left + right : left - right);

export function evaluateMath(input: string): number | null {
  const src = input.replace(/mm|°|%/g, '').trim();

  if (!src) return null;

  if (!/^[\d\s.+\-*/()]+$/.test(src)) return null;

  return new MathParser(src).parse();
}

export function clampNumber(v: number, { min, max, precision }: { min?: number; max?: number; precision: number }) {
  let n = v;

  if (min !== undefined) n = Math.max(min, n);

  if (max !== undefined) n = Math.min(max, n);

  const f = Math.pow(10, precision);

  return Math.round(n * f) / f;
}

export function formatNumber(v: number, precision: number) {
  if (!Number.isFinite(v)) return '';

  const f = Math.pow(10, precision);

  return String(Math.round(v * f) / f);
}

export function stepMultiplier(e: { shiftKey: boolean; altKey: boolean }) {
  if (e.shiftKey) return 10;

  return e.altKey ? 0.1 : 1;
}
