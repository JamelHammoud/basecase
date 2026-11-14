import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const BUTTON_TAG = /<(?:IconButton|Button)\b/g;
const DELETE_LABEL = /\blabel: '(Delete\b[^']*)'/g;
const DELETE_TITLE = /\btitle=(?:"|\{['`])Delete\b/;

function tagEnd(source: string, from: number) {
  let depth = 0;

  for (let i = from; i < source.length; i++) {
    const c = source[i];

    if (c === '{') depth++;

    if (c === '}') depth--;

    if (depth === 0 && c === '>') return i + 1;
  }

  return source.length;
}

function entryStart(source: string, from: number) {
  let depth = 0;

  for (let i = from; i >= 0; i--) {
    if (source[i] === '}') depth++;

    if (source[i] === '{' && depth-- === 0) return i;
  }

  return 0;
}

function entryAround(source: string, at: number) {
  const start = entryStart(source, at);
  let depth = 0;

  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;

    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }

  return source.slice(start);
}

const childText = (source: string, end: number) => source.slice(end, source.indexOf('<', end)).trim();

function deletesSomething(tag: string, children: string) {
  if (tag.includes('<DeleteIcon')) return true;

  if (DELETE_TITLE.test(tag)) return true;

  return !tag.endsWith('/>') && children.startsWith('Delete');
}

function greyDeletes(source: string) {
  const buttons = [...source.matchAll(BUTTON_TAG)].flatMap((m) => {
    const end = tagEnd(source, m.index);
    const tag = source.slice(m.index, end);
    const title = /\btitle=(?:"([^"]+)"|\{['`]([^'`]+)['`]\})/.exec(tag);
    const named = title?.[1] ?? title?.[2] ?? childText(source, end);

    return deletesSomething(tag, childText(source, end)) && !tag.includes('variant="danger"') ? [named] : [];
  });
  const entries = [...source.matchAll(DELETE_LABEL)]
    .filter((m) => {
      const entry = entryAround(source, m.index);

      return /\bonSelect\b/.test(entry) && !/\btone: 'danger'/.test(entry);
    })
    .map((m) => m[1]);

  return [...buttons, ...entries];
}

describe('delete tone', () => {
  it('reads the samples right', () => {
    expect(
      greyDeletes(`
        <IconButton icon={<DeleteIcon className="w-4 h-4" />} variant="danger" title="Delete" onClick={go} />
        <IconButton icon={<DeleteIcon className="w-4 h-4" />} title="Delete mark" onClick={go} />
        <IconButton icon={<CloseIcon />} title="Remove quote" onClick={go} />
        <IconButton icon={<TrashIcon />} title={\`Delete \${name}\`} onClick={go} />
        <Button variant="ghost" onClick={() => confirmAction({ title: 'Delete it?' })}>
          Delete Price
        </Button>
        <Button variant="ghost" onClick={go}>Done</Button>
        [{ label: 'Delete Marks', icon: <DeleteIcon />, onSelect: go }]
        [{ label: 'Delete Marks', icon: <DeleteIcon />, tone: 'danger' as const, onSelect: go }]
        [{ label: 'Delete Step', icon: <DeleteIcon className={cls} />, onSelect: () => { go(); } }]
        [{ ...deleteEntry(go), label: 'Delete Marks' }]
        { id: 'tool-delete-marks', label: 'Delete Marks', icon: <DeleteIcon />, run: go }
      `),
    ).toEqual(['Delete mark', 'Delete ${name}', 'Delete Price', 'Delete Marks', 'Delete Step']);
  });

  it('draws every button and menu item that deletes in the danger tone', () => {
    const found = Object.entries(SOURCES).flatMap(([path, source]) => greyDeletes(source).map((d) => `${path} ${d}`));

    expect(found).toEqual([]);
  });
});
