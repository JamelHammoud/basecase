export interface XmlElement {
  tag: string;
  attrs: Array<[string, string]>;
  children: XmlChild[];
}

export type XmlChild = XmlElement | string;

export class XmlError extends Error {}

const ENTITIES = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
]);

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES.get(name) ?? whole;

    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));

    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

const OPEN_TAG = /^<([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const SKIPPED = [
  ['<!--', '-->'],
  ['<?', '?>'],
] as const;

const attrsOf = (text: string): Array<[string, string]> =>
  [...text.matchAll(ATTR)].map((m) => [m[1], decodeEntities(m[2] ?? m[3])]);

interface Cursor {
  text: string;
  at: number;
  stack: XmlElement[];
}

function endOf(c: Cursor, close: string): number {
  const end = c.text.indexOf(close, c.at);

  if (end < 0) throw new XmlError(`Unclosed ${close}`);

  return end + close.length;
}

function closeTag(c: Cursor) {
  const m = /^<\/([A-Za-z_][\w:.-]*)\s*>/.exec(c.text.slice(c.at));
  const open = c.stack.pop();

  if (!m || !open || open.tag !== m[1] || !c.stack.length) throw new XmlError(`Mismatched </${m?.[1] ?? ''}>`);

  c.at += m[0].length;
}

function openTag(c: Cursor) {
  const m = OPEN_TAG.exec(c.text.slice(c.at));

  if (!m) throw new XmlError(`Malformed tag at ${c.at}`);

  const el: XmlElement = { tag: m[1], attrs: attrsOf(m[2]), children: [] };

  c.stack[c.stack.length - 1].children.push(el);
  c.at += m[0].length;

  if (!m[3]) c.stack.push(el);
}

function markup(c: Cursor) {
  const rest = c.text.startsWith.bind(c.text);
  const skipped = SKIPPED.find(([open]) => rest(open, c.at));

  if (skipped) {
    c.at = endOf(c, skipped[1]);

    return;
  }

  if (rest('<![CDATA[', c.at)) {
    const end = endOf(c, ']]>');

    c.stack[c.stack.length - 1].children.push(c.text.slice(c.at + 9, end - 3));
    c.at = end;

    return;
  }

  if (rest('<!', c.at)) throw new XmlError('Document type declarations aren’t read');

  if (rest('</', c.at)) closeTag(c);
  else openTag(c);
}

export function parseXml(text: string): XmlElement {
  const doc: XmlElement = { tag: '#document', attrs: [], children: [] };
  const c: Cursor = { text, at: 0, stack: [doc] };

  while (c.at < text.length) {
    const next = text.indexOf('<', c.at);
    const raw = text.slice(c.at, next < 0 ? text.length : next);

    if (raw.trim() && c.stack.length < 2) throw new XmlError('Text outside the root element');

    if (raw) c.stack[c.stack.length - 1].children.push(decodeEntities(raw));

    if (next < 0) break;

    c.at = next;
    markup(c);
  }

  const roots = doc.children.filter((n): n is XmlElement => typeof n !== 'string');

  if (c.stack.length !== 1 || roots.length !== 1) throw new XmlError('Expected one root element');

  return roots[0];
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

export function serializeXml(node: XmlChild): string {
  if (typeof node === 'string') return escapeText(node);

  const attrs = node.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');

  if (!node.children.length) return `<${node.tag}${attrs}/>`;

  return `<${node.tag}${attrs}>${node.children.map(serializeXml).join('')}</${node.tag}>`;
}

export const attr = (el: XmlElement, name: string) => el.attrs.find(([k]) => k === name)?.[1];

export const elementsOf = (nodes: XmlChild[]) => nodes.filter((n): n is XmlElement => typeof n !== 'string');
