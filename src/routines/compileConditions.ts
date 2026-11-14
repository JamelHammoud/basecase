import type { CompileContext, FactInfo } from './compileContext';
import { type Instr, OP_CODES } from './planTypes';
import type { Condition } from './schema';

export const MAX_COND_STACK = 16;

export type Leaf = Extract<Condition, { fact: string }>;

export class Symbols {
  readonly list: string[] = [];
  private readonly index = new Map<string, number>();

  id(text: string): number {
    const known = this.index.get(text);

    if (known !== undefined) return known;

    this.index.set(text, this.list.length);
    this.list.push(text);

    return this.list.length - 1;
  }
}

export const isLeaf = (cond: Condition): cond is Leaf => 'fact' in cond;

export function leaves(cond: Condition): Leaf[] {
  if (isLeaf(cond)) return [cond];

  if ('all' in cond) return cond.all.flatMap(leaves);

  if ('any' in cond) return cond.any.flatMap(leaves);

  return leaves(cond.not);
}

export function positiveLeaves(cond: Condition): Leaf[] {
  if (isLeaf(cond)) return [cond];

  if ('all' in cond) return cond.all.flatMap(positiveLeaves);

  return [];
}

const COMPARABLE: Record<string, readonly string[]> = {
  boolean: ['is-boolean'],
  number: ['is-number', 'atLeast', 'atMost'],
  identity: ['is-string', 'atLeast', 'atMost'],
  text: ['is-string'],
};

function testKind(leaf: Leaf): string {
  if ('atLeast' in leaf) return 'atLeast';

  if ('atMost' in leaf) return 'atMost';

  return `is-${typeof leaf.is}`;
}

function checkLeaf(ctx: CompileContext, leaf: Leaf, path: string) {
  const fact = ctx.facts.get(leaf.fact);

  if (!fact) {
    ctx.fail('unknown-fact', `Nothing in this Routine publishes ${leaf.fact}.`, path);

    return;
  }

  if (!(COMPARABLE[fact.type] ?? []).includes(testKind(leaf))) {
    ctx.fail('type-mismatch', `${leaf.fact} is ${fact.type}, so it can’t be compared that way.`, path);

    return;
  }

  const answer = 'is' in leaf ? leaf.is : undefined;

  if (fact.answers && typeof answer === 'string' && !fact.answers.includes(answer)) {
    ctx.fail('unknown-answer', `${leaf.fact} only answers ${fact.answers.join(' or ')}.`, path);
  }
}

function depthOf(cond: Condition): number {
  if (isLeaf(cond)) return 1;

  if ('not' in cond) return depthOf(cond.not);

  const items = 'all' in cond ? cond.all : cond.any;

  return Math.max(...items.map((c, i) => i + depthOf(c)), items.length);
}

export function checkCondition(ctx: CompileContext, cond: Condition, path: string) {
  for (const leaf of leaves(cond)) checkLeaf(ctx, leaf, path);

  if (depthOf(cond) > MAX_COND_STACK) ctx.fail('too-large', 'This condition is too complex.', path);
}

function lowerLeaf(fact: FactInfo, leaf: Leaf, symbols: Symbols): Instr {
  if ('atLeast' in leaf) return [OP_CODES.atLeast, fact.index, leaf.atLeast];

  if ('atMost' in leaf) return [OP_CODES.atMost, fact.index, leaf.atMost];

  if (typeof leaf.is === 'string') return [OP_CODES.eqSym, fact.index, symbols.id(leaf.is)];

  return [OP_CODES.eqNum, fact.index, Number(leaf.is)];
}

export function lowerCondition(ctx: CompileContext, cond: Condition, symbols: Symbols): Instr[] {
  if (isLeaf(cond)) return [lowerLeaf(ctx.facts.get(cond.fact) as FactInfo, cond, symbols)];

  if ('not' in cond) return [...lowerCondition(ctx, cond.not, symbols), [OP_CODES.not, 0, 0]];

  const items = 'all' in cond ? cond.all : cond.any;
  const code = 'all' in cond ? OP_CODES.all : OP_CODES.any;

  return [...items.flatMap((c) => lowerCondition(ctx, c, symbols)), [code, items.length, 0]];
}
