import { describe, expect, it } from 'vitest';
import { shortcutKeys } from './appLabels.mjs';
import { literalsOf } from './extract.mjs';
import { labelIndex, labelsInArticle, missingLabels } from './labels.mjs';

const article = (body) => `---\ntitle: Run a simulation\ndate: 2026-11-13\n---\n\n${body}\n`;

const APP = labelIndex({
  strings: ['Simulate', 'Delete Marks', 'Settings', 'Canvas', 'Snapping', 'Compare with {…}', 'Robot Package'],
  keys: ['⌘K', '⇧⌘Z'],
  exceptions: [{ label: 'Run anyway', reason: "in Windows SmartScreen's warning" }],
});

const check = (body, index = APP) =>
  missingLabels(article(body), index).map(({ line, message }) => `${line}: ${message}`);

describe('labelsInArticle', () => {
  it('reads bold labels after a verb, menu paths segment by segment, and key caps, with their lines', () => {
    const source = article(
      [
        '1. Click **Simulate**, then choose **Snapping** or **Canvas**.',
        '2. Open Settings ▸ **Canvas** ▸ **Snapping**, and press [[⌘K]].',
        'In the **Inspector**, nothing is clicked.',
      ].join('\n'),
    );

    expect(labelsInArticle(source).map(({ kind, text, line }) => `${line} ${kind} ${text}`)).toEqual([
      '6 label Simulate',
      '6 label Snapping',
      '6 label Canvas',
      '7 label Settings',
      '7 label Canvas',
      '7 label Snapping',
      '7 key ⌘K',
    ]);
  });

  it('skips front matter, fenced code, inline code and link targets', () => {
    const source = article(
      [
        '```',
        'Click **Clear Marks**',
        '```',
        'Run `click **Gone**`, or see [Import a robot](/help/import ▸ **Gone**).',
      ].join('\n'),
    );

    expect(labelsInArticle(source).map(({ text }) => text)).toEqual([]);
  });
});

describe('missingLabels', () => {
  it('passes a label the app has', () => {
    expect(check('1. Click **Simulate**.')).toEqual([]);
  });

  it('fails a renamed label and suggests the current one through the glossary', () => {
    expect(check('1. Right-click the canvas and click **Clear Marks**.')).toEqual([
      '6: **Clear Marks** names no label in the app; the closest is “Delete Marks” (§3f)',
    ]);
  });

  it('checks a menu path segment by segment', () => {
    expect(check('Open **Settings** ▸ **Canvas** ▸ **Snapping**.')).toEqual([]);
    expect(check('Open **Settings** ▸ **Canvass** ▸ **Snapping**.')).toEqual([
      '6: **Canvass** names no label in the app; the closest is “Canvas” (§3f)',
    ]);
  });

  it('passes a key combination only when the shortcut table holds it', () => {
    expect(check('Press [[⌘S]] to save.')).toEqual(["6: [[⌘S]] isn't a shortcut in electron/shortcuts.json (§3f)"]);
    expect(check('Press [[⌘S]] to save.', labelIndex({ strings: [], keys: ['⌘S'] }))).toEqual([]);
    expect(check('Press [[⌘⇧Z]], [[Esc]], [[W A S D]] or hold [[⇧]].')).toEqual([]);
  });

  it('passes an exception, a placeholder for a name, and a label spelled with either apostrophe', () => {
    const index = labelIndex({ strings: ['Don’t label', 'Compare with {…}'], keys: [] });

    expect(check('Click **Run anyway**.')).toEqual([]);
    expect(check('Click **Run anyway**.', index)).toHaveLength(1);
    expect(check("Choose **Compare with ⟨scene⟩**, then click **Don't label**.", index)).toEqual([]);
  });

  it('ignores labels in fenced code blocks', () => {
    expect(check('```\nClick **Clear Marks** and press [[⌘S]].\n```')).toEqual([]);
  });
});

describe('the app inventory', () => {
  it('reads every literal, template and JSX text, but not module paths', () => {
    const source = [
      "import { x } from './Simulate';",
      "const ROLL_BACK = 'Roll Back';",
      'const title = `Print Plate ${n}`;',
      'const view = <Button>Test Connection</Button>;',
    ].join('\n');

    expect(literalsOf(source, 'view.tsx')).toEqual(['Roll Back', 'Print Plate {…}', 'Test Connection']);
  });

  it('reads keys from the one shortcut table, ranges expanded', () => {
    expect(shortcutKeys()).toEqual(expect.arrayContaining(['⌘K', '⇧⌘Z', '⌘1', '⌘8', '⌘↩']));
  });
});
