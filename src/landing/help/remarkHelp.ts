import { headingSlugger } from './headings';

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

const KEYS = /\[\[([^[\]]+)\]\]/g;
const CALLOUT = /^\[!(NOTE|WARNING)\][ \t]*\n?/;
const MODIFIERS = /[⌘⇧⌥⌃]|[^⌘⇧⌥⌃\s+]+/g;

const text = (value: string): MdNode => ({ type: 'text', value });

export const keyCaps = (combo: string) => combo.match(MODIFIERS) ?? [combo.trim()];

const keysNode = (combo: string): MdNode => ({
  type: 'keys',
  data: { hName: 'span', hProperties: { dataKeys: '' } },
  children: keyCaps(combo).map((key) => ({ type: 'key', data: { hName: 'kbd' }, children: [text(key)] })),
});

function splitKeys(value: string): MdNode[] {
  const parts: MdNode[] = [];
  let last = 0;

  for (const match of value.matchAll(KEYS)) {
    parts.push(text(value.slice(last, match.index)), keysNode(match[1]));
    last = match.index + match[0].length;
  }

  parts.push(text(value.slice(last)));

  return parts.filter((part) => part.type !== 'text' || part.value !== '');
}

const nodeText = (node: MdNode): string => node.value ?? (node.children ?? []).map(nodeText).join('');

function markCallout(node: MdNode) {
  const paragraph = node.children?.[0];
  const first = paragraph?.children?.[0];
  const match = first?.type === 'text' ? CALLOUT.exec(first.value ?? '') : null;

  if (!paragraph || !first || !match) return;

  first.value = (first.value ?? '').slice(match[0].length);
  paragraph.children = paragraph.children!.filter((child) => child.type !== 'text' || child.value !== '');
  node.children = node.children!.filter((child) => child.type !== 'paragraph' || (child.children ?? []).length > 0);
  node.data = { hName: 'aside', hProperties: { dataCallout: match[1].toLowerCase() } };
}

function transform(node: MdNode, slug: (text: string) => string) {
  if (node.type === 'heading' && node.depth === 2) {
    node.data = { hProperties: { id: slug(nodeText(node).replace(KEYS, '$1').trim()) } };
  }

  if (node.type === 'blockquote') markCallout(node);

  node.children = node.children?.flatMap((child) => (child.type === 'text' ? splitKeys(child.value ?? '') : [child]));
  node.children?.forEach((child) => transform(child, slug));
}

export const remarkHelp = () => (tree: MdNode) => transform(tree, headingSlugger());
