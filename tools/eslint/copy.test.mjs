import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { BANNED_COPY, findBannedCopy } from './copy-banned.mjs';
import rule from './copy.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const SAMPLES = {
  yet: 'No parts yet',
  please: 'Please pick a part',
  simply: 'Simply drag it',
  easily: 'Easily add parts',
  successfully: 'Saved successfully',
  Oops: 'Oops, that failed',
  'Uh-oh': 'Uh-oh, no printer',
  Invalid: 'Invalid size',
  'will appear here': 'Parts will appear here',
  'show up here': 'Your chats show up here',
  'click here': 'Click here to add',
  '·': 'Group · Ungroup',
};

const errors = (word) => [{ messageId: 'banned', data: { word, fix: BANNED_COPY.find((b) => b.word === word).fix } }];

describe('banned copy list', () => {
  it('has a sample for every banned word', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(BANNED_COPY.map((b) => b.word).sort());
  });

  it('finds each banned word in its sample', () => {
    for (const [word, text] of Object.entries(SAMPLES)) expect(findBannedCopy(text)?.word).toBe(word);
  });

  it('keeps unit dots, masked fields and words that only contain a banned one', () => {
    for (const text of ['12 N·m', '3 kg·cm', '••••••••', 'Saved just now', 'Valid', 'Yeti', 'Pleased'])
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
    "const command = { id: 'please', label: 'Group' };",
    'const torque = <span>{`${n} N·m`}</span>;',
  ],
  invalid: [
    ...Object.entries(SAMPLES).map(([word, text]) => ({ code: `const el = <p>${text}</p>;`, errors: errors(word) })),
    { code: 'const el = <input placeholder="Please type" />;', errors: errors('please') },
    { code: '<button aria-label={busy ? "Saving" : "Saved successfully"} />;', errors: errors('successfully') },
    { code: '<Row description="Chats will appear here" />;', errors: errors('will appear here') },
    { code: "const el = <p>{a}{' · '}{b}</p>;", errors: errors('·') },
    { code: 'const el = <p>{`${a} · ${b}`}</p>;', errors: errors('·') },
    { code: "showToast('Exported successfully');", errors: errors('successfully') },
    { code: "toasts.notify({ message: 'Oops' });", errors: errors('Oops') },
    { code: "confirmAction({ title: 'Delete it?', message: 'Invalid name' });", errors: errors('Invalid') },
    { code: "const commands = [{ id: 'group', label: 'Group · Ungroup' }];", errors: errors('·') },
  ],
});
