import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

const BUTTON_TAG = /<(?:IconButton|Button)\b/g;
const MENU_ENTRY = /\{[^{}]*\blabel: '(Delete\b[^']*)'[^{}]*\bonSelect:[^{}]*\}/g;

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

const childText = (source: string, end: number) => source.slice(end, source.indexOf('<', end)).trim();

function deletesSomething(tag: string, children: string) {
  if (tag.includes('<DeleteIcon')) return true;

  if (/\btitle="Delete\b/.test(tag)) return true;

  return !tag.endsWith('/>') && children.startsWith('Delete');
}

function greyDeletes(source: string) {
  const buttons = [...source.matchAll(BUTTON_TAG)].flatMap((m) => {
    const end = tagEnd(source, m.index);
    const tag = source.slice(m.index, end);
    const named = /\btitle="([^"]+)"/.exec(tag)?.[1] ?? childText(source, end);

    return deletesSomething(tag, childText(source, end)) && !tag.includes('variant="danger"') ? [named] : [];
  });
  const entries = [...source.matchAll(MENU_ENTRY)]
    .filter(([entry]) => !/\btone: 'danger'/.test(entry))
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
        <Button variant="ghost" onClick={() => confirmAction({ title: 'Delete it?' })}>
          Delete Price
        </Button>
        <Button variant="ghost" onClick={go}>Done</Button>
        [{ label: 'Delete Marks', icon: <DeleteIcon />, onSelect: go }]
        [{ label: 'Delete Marks', icon: <DeleteIcon />, tone: 'danger' as const, onSelect: go }]
        { id: 'tool-delete-marks', label: 'Delete Marks', icon: <DeleteIcon />, run: go }
      `),
    ).toEqual(['Delete mark', 'Delete Price', 'Delete Marks']);
  });

  it('draws every button and menu item that deletes in the danger tone', () => {
    const found = Object.entries(SOURCES).flatMap(([path, source]) => greyDeletes(source).map((d) => `${path} ${d}`));

    expect(found).toEqual([]);
  });
});
