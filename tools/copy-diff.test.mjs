import { describe, expect, it } from 'vitest';
import { copySummary, diffCopy, formatCopyDiff } from './copy-diff.mjs';

const texts = (list) => list.map(({ text }) => text);

const PANEL_BEFORE = `export const Panel = ({ parts }) => (
  <section>
    <IconButton aria-label="Close panel" onClick={close} />
    {parts.length === 0 && <p className="empty">Parts you add will be listed here</p>}
  </section>
);
`;

const PANEL_AFTER = `export const Panel = ({ parts }) => (
  <section>
    <IconButton aria-label="Close panel" onClick={close} />
    <Button label="Add Part" onClick={add} />
  </section>
);
`;

const SAVE_BEFORE = `export function save(scene) {
  write(scene);
  showToast('Saved the scene', { tone: 'success' });
}
`;

const SAVE_AFTER = `export function save(scene) {
  write(scene);
  showToast(\`Saved \${scene.name}\`, { tone: 'success' });
}
`;

describe('diffCopy', () => {
  it('counts an added label and a removed empty-state caption', () => {
    const diff = diffCopy([{ file: 'src/Panel.tsx', before: PANEL_BEFORE, after: PANEL_AFTER }]);

    expect(texts(diff.added)).toEqual(['Add Part']);
    expect(texts(diff.removed)).toEqual(['Parts you add will be listed here']);
    expect(diff.changed).toEqual([]);
    expect(diff.net).toBe(0);
  });

  it('counts a reworded toast as changed, not added', () => {
    const diff = diffCopy([{ file: 'src/save.ts', before: SAVE_BEFORE, after: SAVE_AFTER }]);

    expect(diff.changed.map(({ before, after }) => [before.text, after.text])).toEqual([
      ['Saved the scene', 'Saved {…}'],
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.net).toBe(0);
  });

  it('counts a new file and a deleted file', () => {
    const diff = diffCopy([
      { file: 'src/New.tsx', after: '<Button label="Export STL" />;' },
      { file: 'src/Old.tsx', before: '<p>No printers</p>;' },
    ]);

    expect(texts(diff.added)).toEqual(['Export STL']);
    expect(texts(diff.removed)).toEqual(['No printers']);
  });

  it('ignores test files and identifiers', () => {
    const diff = diffCopy([
      { file: 'src/Panel.test.tsx', before: '', after: "expect(screen.getByText('No parts yet')).toBeNull();" },
      { file: 'e2e/panel.e2e.test.ts', before: '', after: "await page.getByRole('button', { name: 'Add' });" },
      { file: 'src/ids.ts', before: '', after: "export const ids = { label: 'add-part', mode: 'Edit' };" },
    ]);

    expect(diff).toEqual({ added: [], changed: [], removed: [], net: 0 });
  });

  it('nets out a string that only moved', () => {
    const diff = diffCopy([
      {
        file: 'src/Moved.tsx',
        before: '<p>Lens</p>;',
        after: 'const A = () => (\n  <div>\n    <p>Lens</p>\n  </div>\n);',
      },
    ]);

    expect(diff).toEqual({ added: [], changed: [], removed: [], net: 0 });
  });
});

describe('formatCopyDiff', () => {
  it('lists each string with its place and ends with the net', () => {
    const diff = diffCopy([
      { file: 'src/Panel.tsx', before: PANEL_BEFORE, after: PANEL_AFTER },
      { file: 'src/save.ts', before: SAVE_BEFORE, after: SAVE_AFTER },
      { file: 'src/New.tsx', after: '<Button label="Export STL" />;' },
    ]);

    expect(formatCopyDiff(diff)).toBe(
      [
        '+ "Add Part"  src/Panel.tsx:4',
        '+ "Export STL"  src/New.tsx:1',
        '~ "Saved the scene" → "Saved {…}"  src/save.ts:3',
        '- "Parts you add will be listed here"  src/Panel.tsx:4',
        '',
        'Copy: 2 added, 1 changed, 1 removed, net +1',
      ].join('\n'),
    );
  });

  it('prints only the summary when nothing changed', () => {
    expect(copySummary({ added: [], changed: [], removed: [], net: 0 })).toBe(
      'Copy: 0 added, 0 changed, 0 removed, net 0',
    );
  });
});
