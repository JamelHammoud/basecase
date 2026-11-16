import { describe, expect, it } from 'vitest';
import { copyOccurrences, diffCopy, formatCopyDiff } from '../copy-diff.mjs';
import { judge } from './budget.mjs';

const files = [
  { file: 'src/Old.tsx', before: '<button>Close</button>', after: null },
  { file: 'src/New.tsx', after: '<><button>Close</button><button>Close</button><button>Close</button></>' },
  { file: 'src/Renamed.tsx', renamedFrom: 'src/Name.tsx', before: '<p>Name</p>', after: '<p>Name</p>' },
  { file: 'src/State.tsx', before: '<p>Stopped</p>', after: '<p>Running</p>' },
  { file: 'electron/app-menu.mjs', after: "item('Open Scene', 'open-scene');" },
  {
    file: 'electron/dialogs.mjs',
    after: "dialog.showMessageBox({ message: 'Save scene?', buttons: ['Save', 'Cancel'] });",
  },
  { file: 'electron/protocol.mjs', after: "console.log('Internal log'); const record = { label: 'Protocol name' };" },
  {
    file: 'src/log.ts',
    after: "console.warn({ message: 'Internal log detail' }); logger.info({ label: 'Internal label' });",
  },
  { file: 'src/data/parts.ts', after: "const part = { label: 'Catalog record' };" },
];

describe('occurrence accounting shared by budget and review', () => {
  it('cancels moves and renames, counts repeat growth and keeps changed wording accountable', () => {
    const diff = diffCopy(files);
    const occurrences = copyOccurrences(diff);
    const missing = judge({ ...occurrences, body: '', banned: [] });

    expect(diff.net).toBe(6);
    expect(missing.net).toBe(diff.net);
    expect(missing.unjustified.map(({ text }) => text)).toEqual([
      'Close',
      'Close',
      'Open Scene',
      'Save scene?',
      'Save',
      'Cancel',
      'Running',
    ]);
    expect(occurrences.removed.map(({ text }) => text)).toEqual(['Stopped']);
    expect(formatCopyDiff(diff)).toContain('Stopped');

    const body = [...new Set(occurrences.added.map(({ text }) => text))]
      .map((text) => `copy: "${text}" - Identifies the action at each entry point`)
      .join('\n');
    const verdict = judge({ ...occurrences, body, banned: [] });

    expect(verdict.ok).toBe(true);
    expect(verdict.items.filter(({ text }) => text === 'Close')).toHaveLength(2);
    expect(verdict.items.every(({ why, file, line }) => why && file && line)).toBe(true);
  });

  it('extracts conditional and accessible text and templates without logs, ids or catalog fixtures', () => {
    const diff = diffCopy([
      {
        file: 'src/View.tsx',
        after: '<button aria-label={open ? "Close panel" : "Open panel"}>{busy ? `Saving ${name}` : "Save"}</button>',
      },
      {
        file: 'electron/dialogs.mjs',
        after: 'dialog.showErrorBox("Export failed", `Save ${name} again`); ipc.send("protocol-name");',
      },
      { file: 'electron/fixtures/menu.mjs', after: 'dialog.showErrorBox("Fixture title", "Fixture body");' },
    ]);

    expect(copyOccurrences(diff).added.map(({ text }) => text)).toEqual([
      'Close panel',
      'Open panel',
      'Saving {…}',
      'Save',
      'Export failed',
      'Save {…} again',
    ]);
  });
  it('keeps deletions negative and counts wording changes in renamed files', () => {
    const diff = diffCopy([
      { file: 'src/Renamed.tsx', renamedFrom: 'src/Old.tsx', before: '<p>Old name</p>', after: '<p>New name</p>' },
      { file: 'src/Deleted.tsx', before: '<p>Removed caption</p>' },
    ]);

    expect(diff.net).toBe(-1);
    expect(diff.changed).toHaveLength(1);
    expect(copyOccurrences(diff).removed.map(({ text }) => text)).toEqual(['Removed caption', 'Old name']);
    expect(judge({ ...copyOccurrences(diff), body: '', banned: [] }).ok).toBe(true);
  });

  it('reads dialog-local conditional messages and literal JSX children once', () => {
    const diff = diffCopy([
      { file: 'src/Literal.tsx', after: '<><p>{"Close"}</p><p>Save {busy ? "now" : "later"}</p></>' },
      {
        file: 'electron/updates.mjs',
        after:
          'function checked(found) { const message = found ? `Downloading ${version}` : "Up to date"; dialog.showMessageBox({ message, detail: "Version 2", buttons: ["Close"] }); }',
      },
    ]);

    expect(copyOccurrences(diff).added.map(({ text }) => text)).toEqual([
      'Close',
      'Save {…}',
      'Downloading {…}',
      'Up to date',
      'Version 2',
      'Close',
    ]);
  });
});
