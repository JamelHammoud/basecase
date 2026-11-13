import type { XmlChild } from './xml';
import { capped, evaluate, formatValue, XacroError, type XacroValue } from './xacroExpr';

export interface Macro {
  params: string[];
  body: XmlChild[];
}

export type Prop =
  { raw: string; scope: Scope; value?: XacroValue; busy?: boolean } | { block: XmlChild[]; scope?: Scope };

export interface TextContext {
  args: Map<string, string>;
  file: string;
}

export class Scope {
  readonly props = new Map<string, Prop>();
  readonly macros = new Map<string, Macro>();

  readonly parent?: Scope;

  constructor(parent?: Scope) {
    this.parent = parent;
  }

  find(name: string): Prop | undefined {
    return this.props.get(name) ?? this.parent?.find(name);
  }

  macro(name: string): Macro | undefined {
    return this.macros.get(name) ?? this.parent?.macro(name);
  }

  get root(): Scope {
    return this.parent ? this.parent.root : this;
  }
}

export function literal(text: string): XacroValue {
  const t = text.trim();

  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);

  if (!t.includes('_') && t && Number.isFinite(Number(t))) return Number(t);

  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';

  return text;
}

function propValue(prop: Prop, name: string, ctx: TextContext): XacroValue {
  if ('block' in prop) throw new XacroError(`${name} is a block`);

  if (prop.value !== undefined) return prop.value;

  if (prop.busy) throw new XacroError(`${name} refers to itself`);

  prop.busy = true;

  const value = evalText(prop.raw, prop.scope, ctx);

  prop.value = typeof value === 'string' ? literal(value) : value;
  prop.busy = false;

  return prop.value;
}

export const lookupIn = (scope: Scope, ctx: TextContext) => (name: string) => {
  const prop = scope.find(name);

  return prop ? propValue(prop, name, ctx) : undefined;
};

const dirOf = (file: string) => '/' + file.replace(/^\/+/, '').split('/').slice(0, -1).join('/');

function command(text: string, scope: Scope, ctx: TextContext): string {
  const [name, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ');

  if (name === 'arg' && ctx.args.has(arg)) return ctx.args.get(arg)!;

  if (name === 'find' && /^[\w.-]+$/.test(arg)) return `package://${arg}`;

  if (name === 'dirname' && !arg) return dirOf(ctx.file);

  if (name === 'optenv' && rest.length > 1) return rest.slice(1).join(' ');

  if (name === 'eval') return formatValue(evaluate(text.trim().slice(4), lookupIn(scope, ctx)));

  throw new XacroError(`Can’t evaluate $(${text})`);
}

function closing(text: string, from: number, open: string, close: string): number {
  let depth = 0;

  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) depth--;

    if (depth === 0) return i;
  }

  throw new XacroError(`Unclosed ${open} in ${text}`);
}

export function evalText(text: string, scope: Scope, ctx: TextContext): XacroValue {
  if (!text.includes('$')) return text;

  const pieces: XacroValue[] = [];
  let i = 0;

  while (i < text.length) {
    const at = text.indexOf('$', i);

    if (at < 0 || at === text.length - 1) {
      pieces.push(text.slice(i));

      break;
    }

    pieces.push(text.slice(i, at));

    const kind = text[at + 1];

    if (kind === '$') {
      pieces.push('$');
      i = at + 2;

      continue;
    }

    if (kind !== '{' && kind !== '(') {
      pieces.push('$');
      i = at + 1;

      continue;
    }

    const end = closing(text, at + 1, kind, kind === '{' ? '}' : ')');
    const inner = text.slice(at + 2, end);

    pieces.push(kind === '{' ? evaluate(inner, lookupIn(scope, ctx)) : command(inner, scope, ctx));
    i = end + 1;
  }

  const kept = pieces.filter((p) => p !== '');

  if (kept.length === 1) return kept[0];

  return capped(kept.map(formatValue).join(''));
}

export const evalString = (text: string, scope: Scope, ctx: TextContext) => formatValue(evalText(text, scope, ctx));

export const blockOf = (scope: Scope, name: string) => {
  const prop = scope.find(name);

  if (!prop || !('block' in prop)) throw new XacroError(`No block named ${name}`);

  return prop;
};
