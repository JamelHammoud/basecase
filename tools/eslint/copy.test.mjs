import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { BANNED_COPY } from '../../verify/rehearsal/uiRules.ts';
import { FIXES, LINTED_COPY, findBannedCopy } from '../copy/banned.mjs';
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

const errors = (text) => [{ messageId: 'banned', data: findBannedCopy(text) }];

describe('banned copy list', () => {
  it('lints only entries of the shared list', () => {
    const shared = BANNED_COPY.map(([source]) => source);

    expect(Object.keys(FIXES).filter((source) => !shared.includes(source))).toEqual([]);
  });

  it('has a sample for every linted entry', () => {
    for (const { pattern } of LINTED_COPY) expect(SAMPLES.some(([text]) => pattern.test(text))).toBe(true);
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
  ],
});
