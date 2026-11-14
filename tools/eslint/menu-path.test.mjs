import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { MENU_PATH_FIX } from '../copy/menuPath.mjs';
import rule from './menu-path.mjs';
import plugin from './plugin.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const arrow = (path) => [{ messageId: 'arrow', data: { path, fix: MENU_PATH_FIX } }];

tester.run('menu-path', rule, {
  valid: [
    'const a = "Add a Map Tiles key in Settings ▸ Accounts.";',
    'const a = "It’s on the printer: Settings ▸ Network ▸ PrusaLink.";',
    'const a = `Build check: blockers ${was} → ${count}.`;',
    'const a = `- Power: ${from} → ${to}`;',
    'const a = "coupler point along B→C, ground A→D";',
    'const a = "Joint id → value";',
    'const a = "130 → 119 mm";',
    'const a = n > 1 ? "Settings" : "Accounts";',
  ],
  invalid: [
    {
      code: 'const a = "Check the access code on the printer: Settings → LAN Only.";',
      errors: arrow('Settings → LAN'),
    },
    { code: 'const a = `Add one from Parts → Power.`;', errors: arrow('Parts → Power') },
    { code: 'const a = "Open File > Import";', errors: arrow('File > Import') },
    { code: 'const a = "Help -> Check for Updates";', errors: arrow('Help -> Check') },
    { code: 'const a = <span>Settings › Device</span>;', errors: arrow('Settings › Device') },
    { code: 'const a = <Row hint="Printer screen: Settings → Device" />;', errors: arrow('Settings → Device') },
  ],
});

describe('menu-path rule', () => {
  it('is part of the basecase plugin', () => {
    expect(plugin.rules['menu-path']).toBe(rule);
  });
});
