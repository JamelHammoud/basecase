import { describe, expect, it } from 'vitest';
import { BANNED_COPY } from '../verify/rehearsal/uiRules.ts';
import { diffStrings, isScanned, judge, parseJustifications, report } from './copy/budget.mjs';
import { extractStrings, isUserFacing } from './copy/extract.mjs';

const texts = (source, file = 'src/View.tsx') => extractStrings(source, file).map(({ text }) => text);

const at = (file, list) => list.map((text, index) => ({ text, line: index + 1, file }));

describe('extractStrings', () => {
  it('reads JSX text, joining expressions into a slot', () => {
    const source = `export const A = () => (
      <div>
        <p>Deleted {name} from the scene</p>
        <span>{count}</span>
        <b>Saving…</b>
      </div>
    );`;

    expect(texts(source)).toEqual(['Deleted {…} from the scene', 'Saving…']);
  });

  it('reads user-facing props, including conditional values', () => {
    const source = `const B = () => (
      <>
        <IconButton aria-label="Close tab" tooltip={open ? 'Hide panel' : 'Show panel'} />
        <input placeholder="Search parts" className="w-4 h-4" data-id="search-box" />
        <img alt={\`Photo of \${name}\`} />
      </>
    );`;

    expect(texts(source)).toEqual(['Close tab', 'Hide panel', 'Show panel', 'Search parts', 'Photo of {…}']);
  });

  it('reads toast and confirm arguments', () => {
    const source = `
      showToast(\`Deleted \${part.name}\`, { tone: 'success', action: { label: 'Undo', onClick } });
      core.toastInFront('Saved scene');
      confirmAction({ title: 'Delete camera?', body: 'You can’t undo this.', confirmLabel: 'Delete', onConfirm });
      console.log('Not user facing');
    `;

    expect(texts(source, 'src/useThing.ts')).toEqual([
      'Deleted {…}',
      'Undo',
      'Saved scene',
      'Delete camera?',
      'You can’t undo this.',
      'Delete',
    ]);
  });

  it('reads command and menu labels but not ids or keywords', () => {
    const source = `const commands = [
      { id: 'reopen-scene', group: 'Scene', label: 'Reopen Closed Scene', shortcut: '⇧⌘T', keywords: 'tab undo' },
    ];`;

    expect(texts(source, 'src/workspace/sceneCommands.tsx')).toEqual(['Reopen Closed Scene']);
  });

  it('reports the line and kind of each string', () => {
    const source = `const C = () => (\n  <div>\n    <p>First</p>\n    <p title="Second" />\n  </div>\n);`;

    expect(extractStrings(source, 'src/C.tsx')).toEqual([
      { text: 'First', kind: 'text', line: 3 },
      { text: 'Second', kind: 'title', line: 4 },
    ]);
  });
});

describe('isUserFacing', () => {
  it.each(['mm', '°', '42', '{…} mm', '⌘K', '×', 'https://example.com/a', 'src/data/parts.ts', 'reopen-scene'])(
    'skips %s',
    (text) => {
      expect(isUserFacing(text)).toBe(false);
    },
  );

  it.each(['Export STL', 'No parts', 'Deleted {…}', 'Lens'])('keeps %s', (text) => {
    expect(isUserFacing(text)).toBe(true);
  });
});

describe('isScanned', () => {
  it.each(['src/components/View.tsx', 'src/workspace/useMarks.ts'])('scans %s', (file) => {
    expect(isScanned(file)).toBe(true);
  });

  it.each(['src/data/parts.ts', 'src/utils/math.test.ts', 'src/types.d.ts', 'electron/main.mjs', 'docs/a.md'])(
    'skips %s',
    (file) => {
      expect(isScanned(file)).toBe(false);
    },
  );
});

describe('diffStrings', () => {
  it('counts strings as a multiset and marks repeats', () => {
    const base = at('src/A.tsx', ['Delete', 'Rename', 'Close']);
    const head = at('src/A.tsx', ['Delete', 'Delete', 'Rename', 'Add Camera']);
    const { added, removed } = diffStrings(base, head);

    expect(added.map(({ text, repeat }) => [text, repeat])).toEqual([
      ['Delete', true],
      ['Add Camera', false],
    ]);
    expect(removed.map(({ text }) => text)).toEqual(['Close']);
  });
});

describe('parseJustifications', () => {
  it('reads copy lines in any list style and quote style', () => {
    const body = [
      '## Copy',
      '',
      'copy: "Add Camera View" — the only entry point for camera views',
      '- copy: “Deleted ${name}” – confirms the delete and offers Undo',
      'copy: "No reason" —',
    ].join('\n');

    expect([...parseJustifications(body)]).toEqual([
      ['Add Camera View', 'the only entry point for camera views'],
      ['Deleted {…}', 'confirms the delete and offers Undo'],
    ]);
  });
});

describe('judge', () => {
  const added = at('src/A.tsx', ['Add Camera View', 'Expand']);

  it('fails a net gain without reasons', () => {
    const verdict = judge({ added, removed: [], body: '', banned: BANNED_COPY });

    expect(verdict.ok).toBe(false);
    expect(verdict.unjustified.map(({ text }) => text)).toEqual(['Add Camera View', 'Expand']);
    expect(report(verdict, [])).toMatch(/Copy: \+2 −0$/);
  });

  it('passes a net gain when every new string has a reason', () => {
    const body = 'copy: "Add Camera View" — the entry point\ncopy: "Expand" — the strip collapses';

    expect(judge({ added, removed: [], body, banned: BANNED_COPY }).ok).toBe(true);
  });

  it('passes when as many strings are removed as added', () => {
    const removed = at('src/B.tsx', ['Nothing to show', 'Close']);

    expect(judge({ added, removed, body: '', banned: BANNED_COPY }).ok).toBe(true);
  });

  it('passes repeats of strings the file already had', () => {
    const repeat = [{ text: 'Delete', line: 4, file: 'src/A.tsx', repeat: true }];

    expect(judge({ added: repeat, removed: [], body: '', banned: BANNED_COPY }).ok).toBe(true);
  });

  it('fails banned words even when the net is negative', () => {
    const removed = at('src/B.tsx', ['One', 'Two', 'Three']);
    const verdict = judge({ added: at('src/A.tsx', ['No parts yet']), removed, body: '', banned: BANNED_COPY });

    expect(verdict.ok).toBe(false);
    expect(report(verdict, removed)).toContain('These strings use words §3c bans');
  });
});
