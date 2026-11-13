import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { BANNED_COPY } from '../../verify/rehearsal/uiRules.ts';
import { FIXES, LINTED_COPY, findBannedCopy } from '../copy/banned.mjs';
import { GLOSSARY } from '../copy/glossary.mjs';
import rule from './copy.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const SAMPLES = [
  ['No parts yet', 'yet'],
  ['Please pick a part', 'Please'],
  ['Simply drag it', 'Simply'],
  ['Easily add parts', 'Easily'],
  ['Saved successfully', 'successfully'],
  ['Oops, that failed', 'Oops'],
  ['Uh-oh, no printer', 'Uh-oh'],
  ['Invalid size', 'Invalid'],
  ['Error: no printer', 'Error:'],
  ['Parts will appear here', 'will appear here'],
  ['Your chats show up here', 'show up here'],
  ['Tried in simulation only', 'Tried in simulation only'],
  ['Click here to add', 'Click here'],
  ['Learn more', 'Learn more'],
  ['Group · Ungroup', '·'],
  ['Group | Ungroup', '|'],
];

const GLOSSARY_SAMPLES = [
  ['Erase Marks', 'Erase', 'Delete'],
  ['Erased 3 marks', 'Erased', 'Delete'],
  ['Remove Price', 'Remove Price', 'Delete'],
  ['Clear Marks', 'Clear Marks', 'Delete'],
  ['Discard Draft', 'Discard', 'Delete'],
  ['Trash', 'Trash', 'Delete'],
  ['Destroy Policy', 'Destroy', 'Delete'],
  ['Detach image', 'Detach', 'Remove'],
  ['Wipe Search', 'Wipe', 'Clear'],
  ['End Try', 'End', 'Stop'],
  ['Halt Robot', 'Halt', 'Stop'],
  ['Abort Print', 'Abort', 'Stop'],
  ['Terminate run', 'Terminate', 'Stop'],
  ['Kill Training', 'Kill', 'Stop'],
  ['View on GitHub', 'View', 'Open'],
  ['See Inside', 'See Inside', 'Open'],
  ['Dismiss', 'Dismiss', 'Close'],
  ['Reveal in Finder', 'Reveal', 'Show'],
  ['Toggle Grid', 'Toggle', 'Show'],
  ['Clone Scene', 'Clone', 'Duplicate'],
  ['Launch Routine', 'Launch', 'Run'],
  ['Execute Case', 'Execute', 'Run'],
  ['Insert Part', 'Insert Part', 'Add'],
  ['Add Robot', 'Add Robot', 'Insert'],
  ['Add a model', 'Add a model', 'Insert'],
];

const SAMPLES_WITH_GLOSSARY = [...SAMPLES, ...GLOSSARY_SAMPLES];

const errors = (text) => [{ messageId: 'banned', data: findBannedCopy(text) }];

describe('banned copy list', () => {
  it('lints only entries of the shared list', () => {
    const shared = BANNED_COPY.map(([source]) => source);

    expect(Object.keys(FIXES).filter((source) => !shared.includes(source))).toEqual([]);
  });

  it('has a sample for every linted entry', () => {
    for (const { pattern } of LINTED_COPY)
      expect(SAMPLES_WITH_GLOSSARY.some(([text]) => pattern.test(text))).toBe(true);
  });

  it('finds each banned word in its sample', () => {
    for (const [text, word] of SAMPLES) expect(findBannedCopy(text)?.word).toBe(word);
  });

  it('keeps unit dots, masked fields, ids and words a reader judges', () => {
    for (const text of [
      '12 N·m',
      '3 kg·cm',
      '••••••••',
      'Saved just now',
      'Valid',
      'Yeti',
      'Pleased',
      'invalid-field',
      'invalid_size',
      'Learn more about joints',
    ])
      expect(findBannedCopy(text)).toBeNull();
  });
});

describe('glossary', () => {
  it('flags each synonym with the word to use', () => {
    for (const [text, word, use] of GLOSSARY_SAMPLES) {
      const hit = findBannedCopy(text);

      expect(hit?.word).toBe(word);
      expect(hit?.fix).toContain(`“${use}”`);
      expect(hit?.section).toBe('§3b-17');
    }
  });

  it('allows each word and the uses its synonyms keep', () => {
    for (const text of [
      ...GLOSSARY.map(({ word }) => word),
      'Delete Marks',
      'Deleted 3 marks',
      'Delete Price',
      'Remove quote',
      'Remove photo.png',
      'Clear search',
      'Clear sketch?',
      'Clear Fault',
      'Eraser',
      'View',
      'Viewer',
      'Endless',
      'Stop Try',
      'Open Scene',
      'See Person',
      'Show in Finder',
      'Insert Robot',
      'Add Part',
      'Add Price',
      'Send to Printer',
      'The run ended',
    ])
      expect(findBannedCopy(text)).toBeNull();
  });

  it('gives every word an action and at least one synonym', () => {
    for (const { word, action, synonyms } of GLOSSARY) {
      expect(word).toMatch(/^[A-Z][a-z]+$/);
      expect(action.length).toBeGreaterThan(0);
      expect(synonyms.length).toBeGreaterThan(0);
    }
  });
});

tester.run('basecase/copy', rule, {
  valid: [
    'const yet = 1;',
    'const label = invalidLabel;',
    "const code = 'invalid-field';",
    "expect(screen.getByText('No parts yet')).toBeNull();",
    'const el = <div className="yet please">No parts</div>;',
    "const el = <Part id={'invalid'} />;",
    "const field = { label: 'invalid-field' };",
    "const el = <Size title={'invalid_size'} />;",
    "showToast('Saved', { id: 'please' });",
    "const command = { id: 'please', label: 'Group' };",
    'const torque = <span>{`${n} N·m`}</span>;',
    "const legacy = 'End Try';",
    "expect(screen.getByRole('button', { name: 'Erase Marks' })).toBeNull();",
    'const el = <Row testId="view-on-github" />;',
    'const el = <button>Stop Try</button>;',
    "const command = { id: 'end-try', label: 'Stop Try' };",
  ],
  invalid: [
    ...SAMPLES.map(([text]) => ({ code: `const el = <p>${text}</p>;`, errors: errors(text) })),
    { code: 'const el = <input placeholder="Please type" />;', errors: errors('Please type') },
    { code: '<button aria-label={busy ? "Saving" : "Saved successfully"} />;', errors: errors('Saved successfully') },
    { code: '<Row description="Chats will appear here" />;', errors: errors('Chats will appear here') },
    { code: '<img alt="Please wait" />;', errors: errors('Please wait') },
    { code: '<Section heading="Oops" />;', errors: errors('Oops') },
    { code: '<Empty emptyText="No parts yet" />;', errors: errors('No parts yet') },
    { code: "confirmAction({ title: 'Delete it?', body: 'Simply undo it' });", errors: errors('Simply undo it') },
    { code: "const el = <p>{a}{' · '}{b}</p>;", errors: errors(' · ') },
    { code: 'const el = <p>{`${a} · ${b}`}</p>;', errors: errors(' · ') },
    { code: "showToast('Exported successfully');", errors: errors('Exported successfully') },
    { code: "toasts.notify({ message: 'Oops' });", errors: errors('Oops') },
    { code: "confirmAction({ title: 'Delete it?', message: 'Invalid name' });", errors: errors('Invalid name') },
    { code: "const commands = [{ id: 'group', label: 'Group · Ungroup' }];", errors: errors(' · ') },
    { code: "const field = { label: 'No parts yet' satisfies string };", errors: errors('No parts yet') },
    { code: "const field = { label: (busy ? 'Saving' : 'Please wait')! };", errors: errors('Please wait') },
    { code: "const command = { id: 'erase', label: 'Erase Marks' };", errors: errors('Erase Marks') },
    { code: 'const el = <button>End Try</button>;', errors: errors('End Try') },
    { code: 'showToast(`Erased ${name}`);', errors: errors('Erased ') },
    { code: '<IconButton title="Remove Price" />;', errors: errors('Remove Price') },
    { code: '<a aria-label={`View ${name}`} />;', errors: errors('View ') },
  ],
});
