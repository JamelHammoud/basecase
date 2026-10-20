export interface NamedPart {
  id: string;
  name: string;
}

export interface PartIndex {
  ids: Map<string, string[]>;
  pattern: RegExp | null;
}

export interface TextRun {
  text: string;
  ids?: string[];
}

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

export const PART_HREF = '#part:';

const MIN_LENGTH = 3;

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addKey = (ids: Map<string, string[]>, key: string, id: string) => {
  if (key.length < MIN_LENGTH) return;

  ids.set(key, [...(ids.get(key) ?? []), id]);
};

export function buildPartIndex(parts: NamedPart[]): PartIndex {
  const ids = new Map<string, string[]>();

  for (const part of parts) {
    addKey(ids, part.id, part.id);

    if (part.name && part.name !== part.id) addKey(ids, part.name.trim(), part.id);
  }

  const keys = [...ids.keys()].sort((a, b) => b.length - a.length).map(escaped);

  return { ids, pattern: keys.length ? new RegExp(`(?<![\\w-])(?:${keys.join('|')})(?![\\w-])`, 'g') : null };
}

export function splitParts(text: string, index: PartIndex): TextRun[] {
  if (!index.pattern) return [{ text }];

  const runs: TextRun[] = [];
  let last = 0;

  for (const match of text.matchAll(index.pattern)) {
    const start = match.index ?? 0;

    if (start > last) runs.push({ text: text.slice(last, start) });

    runs.push({ text: match[0], ids: index.ids.get(match[0]) });
    last = start + match[0].length;
  }

  if (last < text.length) runs.push({ text: text.slice(last) });

  return runs;
}

export const partHref = (ids: string[]) => PART_HREF + encodeURIComponent(ids.join(','));

export const partIdsOf = (href: string | undefined) =>
  href?.startsWith(PART_HREF) ? decodeURIComponent(href.slice(PART_HREF.length)).split(',') : null;

const linkNode = (ids: string[], child: MdNode): MdNode => ({ type: 'link', url: partHref(ids), children: [child] });

function linkChild(child: MdNode, index: PartIndex): MdNode[] {
  if (child.type === 'text') {
    return splitParts(child.value ?? '', index).map((run) =>
      run.ids ? linkNode(run.ids, { type: 'text', value: run.text }) : { type: 'text', value: run.text },
    );
  }

  const codeIds = child.type === 'inlineCode' ? index.ids.get(child.value ?? '') : undefined;

  if (codeIds) return [linkNode(codeIds, child)];

  linkParts(child, index);

  return [child];
}

function linkParts(node: MdNode, index: PartIndex) {
  if (!node.children || node.type === 'link' || node.type === 'linkReference') return;

  node.children = node.children.flatMap((child) => linkChild(child, index));
}

export const remarkPartLinks = (index: PartIndex) => () => (tree: MdNode) => linkParts(tree, index);
