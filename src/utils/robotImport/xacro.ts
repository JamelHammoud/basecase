import { couldntRead, type Resolver } from './sources';
import { attr, elementsOf, parseXml, serializeXml, type XmlChild, type XmlElement } from './xml';
import { truthy, XacroError } from './xacroExpr';
import {
  blockOf,
  evalString,
  evalText,
  literal,
  lookupIn,
  Scope,
  type Macro,
  type Prop,
  type TextContext,
} from './xacroScope';

const MAX_INCLUDE_DEPTH = 8;
const MAX_INCLUDES = 200;
const MAX_MACRO_DEPTH = 40;
const MAX_NODES = 200_000;
const MAX_OUTPUT = 16_000_000;
const PARAM = /(?:[^\s'"]+|'[^']*'|"[^"]*")+/g;
const OUTSIDE_SOURCE = /^(?!package:\/\/)[a-z][\w+.-]*:/i;

interface Ctx extends TextContext {
  read: Resolver['read'];
  spent: { nodes: number; includes: number; chars: number; computed: number };
  includeDepth: number;
  macroDepth: number;
}

type Directive = (el: XmlElement, scope: Scope, ctx: Ctx) => Promise<XmlChild[]> | XmlChild[];

class NamedFailure extends Error {}

async function inFile<T>(file: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NamedFailure) throw error;

    throw new NamedFailure(couldntRead(file).message, { cause: error });
  }
}

const required = (el: XmlElement, name: string) => {
  const value = attr(el, name);

  if (value === undefined) throw new XacroError(`<${el.tag}> needs ${name}`);

  return value;
};

function spend(ctx: Ctx) {
  if (++ctx.spent.nodes > MAX_NODES) throw new XacroError('Expands to too many elements');
}

function emit(text: string, ctx: Ctx) {
  ctx.spent.chars += text.length;

  if (ctx.spent.chars > MAX_OUTPUT) throw new XacroError('Expands to too much text');

  return text;
}

const outputText = (raw: string, scope: Scope, ctx: Ctx) => emit(evalString(raw, scope, ctx), ctx);

async function expandNodes(nodes: XmlChild[], scope: Scope, ctx: Ctx): Promise<XmlChild[]> {
  const out: XmlChild[] = [];

  for (const node of nodes) {
    spend(ctx);

    if (typeof node === 'string') out.push(outputText(node, scope, ctx));
    else if (node.tag.startsWith('xacro:')) out.push(...(await directive(node, scope, ctx)));
    else out.push(await plainElement(node, node.tag, scope, ctx));
  }

  return out;
}

async function plainElement(el: XmlElement, tag: string, scope: Scope, ctx: Ctx): Promise<XmlElement> {
  const attrs = el.attrs
    .filter(([k]) => !k.startsWith('xacro:'))
    .map(([k, v]): [string, string] => [emit(k, ctx), outputText(v, scope, ctx)]);

  return { tag: emit(tag, ctx), attrs, children: await expandNodes(el.children, scope, ctx) };
}

function scopeFor(scope: Scope, where: string | undefined): Scope {
  if (where === 'global') return scope.root;

  return where === 'parent' ? (scope.parent ?? scope) : scope;
}

function property(el: XmlElement, scope: Scope, ctx: Ctx): XmlChild[] {
  const name = required(el, 'name');
  const where = attr(el, 'scope');
  const target = scopeFor(scope, where);
  const raw = attr(el, 'value') ?? attr(el, 'default');

  if (attr(el, 'value') === undefined && raw !== undefined && scope.find(name)) return [];

  if (raw === undefined) {
    target.props.set(name, { block: el.children });

    return [];
  }

  const prop: Prop = { raw, scope };

  if (where) prop.value = valueOf(raw, scope, ctx);

  target.props.set(name, prop);

  return [];
}

function valueOf(raw: string, scope: Scope, ctx: Ctx) {
  const value = evalText(raw, scope, ctx);

  return typeof value === 'string' ? literal(value) : value;
}

function arg(el: XmlElement, scope: Scope, ctx: Ctx): XmlChild[] {
  const name = required(el, 'name');
  const fallback = attr(el, 'default');

  if (!ctx.args.has(name) && fallback !== undefined) ctx.args.set(name, evalString(fallback, scope, ctx));

  return [];
}

function macro(el: XmlElement, scope: Scope): XmlChild[] {
  scope.macros.set(required(el, 'name'), { params: attr(el, 'params')?.match(PARAM) ?? [], body: el.children });

  return [];
}

const condition = (keep: boolean) => (el: XmlElement, scope: Scope, ctx: Ctx) =>
  truthy(evalText(required(el, 'value'), scope, ctx)) === keep ? expandNodes(el.children, scope, ctx) : [];

async function include(el: XmlElement, scope: Scope, ctx: Ctx): Promise<XmlChild[]> {
  const ref = evalString(required(el, 'filename'), scope, ctx);

  if (attr(el, 'ns') !== undefined) throw new XacroError('Namespaced includes aren’t read');

  if (!ref || OUTSIDE_SOURCE.test(ref)) throw new XacroError(`${ref} is outside the import`);

  if (ctx.includeDepth >= MAX_INCLUDE_DEPTH || ++ctx.spent.includes > MAX_INCLUDES)
    throw new XacroError('Too many nested includes');

  const got = await ctx.read(ref, ctx.file);

  if (!got) throw new NamedFailure(couldntRead(ref).message);

  const text = new TextDecoder().decode(got.data);
  const inner = { ...ctx, file: got.path, includeDepth: ctx.includeDepth + 1 };

  return inFile(got.path, () => expandNodes(parseXml(text).children, scope, inner));
}

function insertBlock(el: XmlElement, scope: Scope, ctx: Ctx) {
  const prop = blockOf(scope, evalString(required(el, 'name'), scope, ctx));

  return expandNodes(prop.block, prop.scope ?? scope, ctx);
}

async function element(el: XmlElement, scope: Scope, ctx: Ctx): Promise<XmlChild[]> {
  return [await plainElement(el, evalString(required(el, 'xacro:name'), scope, ctx), scope, ctx)];
}

const call = (el: XmlElement, scope: Scope, ctx: Ctx) =>
  callMacro(
    evalString(required(el, 'macro'), scope, ctx),
    { ...el, attrs: el.attrs.filter(([k]) => k !== 'macro') },
    scope,
    ctx,
  );

const DIRECTIVES = new Map<string, Directive>([
  ['property', property],
  ['arg', arg],
  ['macro', macro],
  ['if', condition(true)],
  ['unless', condition(false)],
  ['include', include],
  ['insert_block', insertBlock],
  ['element', element],
  ['call', call],
]);

function directive(el: XmlElement, scope: Scope, ctx: Ctx) {
  const name = el.tag.slice('xacro:'.length);

  return (DIRECTIVES.get(name) ?? ((e, s, c) => callMacro(name, e, s, c)))(el, scope, ctx);
}

interface Binding {
  caller: Scope;
  local: Scope;
  given: Map<string, string>;
  blocks: XmlElement[];
  ctx: Ctx;
}

function bindBlock(spec: string, b: Binding) {
  const el = b.blocks.shift();

  if (!el) throw new XacroError(`Missing block ${spec}`);

  const named = spec.startsWith('**');

  b.local.props.set(spec.slice(named ? 2 : 1), { block: named ? el.children : [el], scope: b.caller });
}

function inherited(name: string, fallback: string | undefined, b: Binding): Prop {
  const value = lookupIn(b.caller, b.ctx)(name);

  if (value !== undefined) return { raw: '', scope: b.caller, value };

  if (fallback === undefined) throw new XacroError(`No ${name} to take from the parent scope`);

  return { raw: fallback, scope: b.local };
}

function paramProp(spec: string, b: Binding): [string, Prop] {
  const [name, fallback] = spec.split(':=', 2) as [string, string | undefined];
  const passed = b.given.get(name);

  b.given.delete(name);

  if (passed !== undefined) return [name, { raw: '', scope: b.caller, value: valueOf(passed, b.caller, b.ctx) }];

  if (fallback?.startsWith('^')) return [name, inherited(name, /^\^\|(.*)$/.exec(fallback)?.[1], b)];

  if (fallback === undefined) throw new XacroError(`Missing ${name}`);

  return [name, { raw: fallback, scope: b.local }];
}

function bind(m: Macro, b: Binding) {
  for (const spec of m.params) {
    if (spec.startsWith('*')) bindBlock(spec, b);
    else b.local.props.set(...paramProp(spec, b));
  }

  if (b.given.size) throw new XacroError(`Unknown parameters ${[...b.given.keys()].join(', ')}`);
}

async function callMacro(name: string, el: XmlElement, scope: Scope, ctx: Ctx): Promise<XmlChild[]> {
  const m = scope.macro(name);

  if (!m) throw new XacroError(`Unknown xacro:${name}`);

  if (ctx.macroDepth >= MAX_MACRO_DEPTH) throw new XacroError('Macros nest too deep');

  const local = new Scope(scope);
  const given = new Map(el.attrs.filter(([k]) => !k.startsWith('xmlns')));

  bind(m, { caller: scope, local, given, blocks: elementsOf(el.children), ctx });

  return expandNodes(m.body, local, { ...ctx, macroDepth: ctx.macroDepth + 1 });
}

export const isXacro = (path: string, text: string) => /\.xacro$/i.test(path) || /<xacro:/.test(text);

export async function expandXacro(text: string, { read, from }: { read: Resolver['read']; from: string }) {
  const ctx: Ctx = {
    read,
    file: from,
    args: new Map(),
    spent: { nodes: 0, includes: 0, chars: 0, computed: 0 },
    includeDepth: 0,
    macroDepth: 0,
  };

  return inFile(from, async () => {
    const root = parseXml(text);
    const scope = new Scope();
    const children = await expandNodes(root.children, scope, ctx);
    const robot = await plainElement({ ...root, children: [] }, root.tag, scope, ctx);

    return serializeXml({ ...robot, children });
  });
}
