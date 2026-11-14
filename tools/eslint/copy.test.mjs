import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { BANNED_COPY } from '../../verify/rehearsal/uiRules.ts';
import { FIXES, LINTED_COPY, findBannedCopy } from '../copy/banned.mjs';
import { GLOSSARY } from '../copy/glossary.mjs';
import { PLACEHOLDER_FIX } from '../copy/placeholder.mjs';
import { SPELLING } from '../copy/spelling.mjs';
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
  ['Browse Robots', 'Browse', 'Show'],
  ['Clone Scene', 'Clone', 'Duplicate'],
  ['Launch Routine', 'Launch', 'Run'],
  ['Execute Case', 'Execute', 'Run'],
  ['Insert Part', 'Insert Part', 'Add'],
  ['Add Robot', 'Add Robot', 'Insert'],
  ['Add a model', 'Add a model', 'Insert'],
  ['Create', 'Create', 'Make'],
  ['Created a Case', 'Created', 'Make'],
  ['Generate Guide', 'Generate', 'Make'],
  ['Auto-generated guide', 'Auto-generated', 'Make'],
  ['Regenerate', 'Regenerate', 'Update'],
  ['Recordings', 'Recordings', 'Try'],
  ['Episode 3', 'Episode', 'Try'],
  ['Demos', 'Demos', 'Try'],
  ['Demonstration from the leader arm', 'Demonstration', 'Try'],
];

const SPELLING_SAMPLES = Object.keys(SPELLING).map((british) => [`The ${british} one`, british]);

const APOSTROPHE_SAMPLES = [["Couldn't load the model", "n't"]];

const MINUS_SAMPLES = [
  ['Head between -180° and 180°.', '-180'],
  ['-0.42 N·m', '-0.42'],
  ['Margin (-1.5)', '-1.5'],
];

const AT_SAMPLES = [
  ['0.52 N·m @ 5 V', '@'],
  ['4× Cortex-A76 @ 2.4 GHz', '@'],
];

const SAMPLES_WITH_GLOSSARY = [
  ...SAMPLES,
  ...GLOSSARY_SAMPLES,
  ...SPELLING_SAMPLES,
  ...APOSTROPHE_SAMPLES,
  ...MINUS_SAMPLES,
  ...AT_SAMPLES,
];

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
      'Recording parts on hand',
      'Recorded 3 tries',
      'View',
      'Viewer',
      'Endless',
      'End',
      'End effector',
      'End effectors: 2',
      'Stop Try',
      'Open Scene',
      'See Person',
      'Show in Finder',
      'Insert Robot',
      'Add Part',
      'Add Price',
      'Send to Printer',
      'Make Guide',
      'Made 3 Cases',
      '2 generated',
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

describe('spelling', () => {
  it('flags each British spelling with the American one', () => {
    for (const [text, british] of SPELLING_SAMPLES) {
      const hit = findBannedCopy(text);

      expect(hit?.word).toBe(british);
      expect(hit?.fix).toContain(`“${SPELLING[british]}”`);
      expect(hit?.section).toBe('§3b-20');
    }
  });

  it('allows the American spellings and ids that keep the British one', () => {
    for (const text of [
      ...Object.values(SPELLING).map((american) => `The ${american} one`),
      'robot.travelled',
      'Greyhound',
    ])
      expect(findBannedCopy(text)).toBeNull();
  });
});

describe('apostrophes', () => {
  it('flags a straight apostrophe between letters', () => {
    for (const [text, word] of APOSTROPHE_SAMPLES) {
      const hit = findBannedCopy(text);

      expect(hit?.word).toBe(word);
      expect(hit?.fix).toContain('“can’t”');
      expect(hit?.section).toBe('§3b-21');
    }
  });

  it('allows ’ and quotes around a word', () => {
    for (const text of ['Couldn’t load the model', "Name it 'Arm'", "The robots' joints"])
      expect(findBannedCopy(text)).toBeNull();
  });
});

describe('minus signs', () => {
  it('flags a hyphen written as a minus sign', () => {
    for (const [text, word] of MINUS_SAMPLES) {
      const hit = findBannedCopy(text);

      expect(hit?.word).toBe(word);
      expect(hit?.section).toBe('§3b-22');
    }
  });

  it('allows − and hyphens inside words and ranges', () => {
    for (const text of ['Head between −180° and 180°.', 'M3-12 screw', 'SO-101 Arm', 'Pages 3-4', 'Wi-Fi'])
      expect(findBannedCopy(text)).toBeNull();
  });
});

describe('at', () => {
  it('flags a spaced @ before a condition', () => {
    for (const [text, word] of AT_SAMPLES) {
      const hit = findBannedCopy(text);

      expect(hit?.word).toBe(word);
      expect(hit?.section).toBe('§3b-23');
    }
  });

  it('allows at, emails, mentions and names with @', () => {
    for (const text of ['0.52 N·m at 5 V', 'someone@example.com', 'Ask @agent about it', '0.20mm Standard @4MaxPro'])
      expect(findBannedCopy(text)).toBeNull();
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
    'const el = <input placeholder="e.g. Servo bracket" />;',
    'const el = <input placeholder="Search parts" />;',
    'const el = <input placeholder={scope ? `Search ${scope.label}` : "Search parts"} />;',
    'const el = <input placeholder={`e.g. ${price}`} />;',
    'const el = <input placeholder="AIza…" />;',
    'const el = <input placeholder={saved ? "••••••••" : ""} />;',
    'const el = <input placeholder={hint} />;',
    "const field = { placeholder: 'e.g. Jump' };",
    'const el = <p>{`Pages ${lo}-5`}</p>;',
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
    { code: 'const el = <p>Centre of mass</p>;', errors: errors('Centre of mass') },
    { code: 'const el = <p>{`-90° to ${hi}`}</p>;', errors: errors('-90° to ') },
    { code: 'const el = <p>{`${lo} to -90°`}</p>;', errors: errors(' to -90°') },
    { code: "const spec = { detail: '0.52 N·m @ 5 V' };", errors: errors('0.52 N·m @ 5 V') },
    ...['Add a comment', 'Reply', 'Name', 'Type a label', 'What’s next'].map((text) => ({
      code: `const el = <input placeholder="${text}" />;`,
      errors: [{ messageId: 'placeholder', data: { text, fix: PLACEHOLDER_FIX } }],
    })),
    {
      code: "const field = { placeholder: 'Enter an address' };",
      errors: [{ messageId: 'placeholder', data: { text: 'Enter an address', fix: PLACEHOLDER_FIX } }],
    },
    {
      code: 'const el = <input placeholder={`Name ${n}`} />;',
      errors: [{ messageId: 'placeholder', data: { text: 'Name', fix: PLACEHOLDER_FIX } }],
    },
  ],
});
