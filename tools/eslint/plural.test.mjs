import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import plugin from './plugin.mjs';
import rule from './plural.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const bare = (word) => [{ messageId: 'bare', data: { word } }];
const ternary = [{ messageId: 'ternary' }];
const agrees = (verb) => [{ messageId: 'agrees', data: { verb } }];

tester.run('plural', rule, {
  valid: [
    'const a = `${plural(parts.length, "part")} left`;',
    'const a = `${n} mm wide`;',
    'const a = `${n} ms`;',
    'const a = `${spec.size} bore bearings`;',
    'const a = `Fault at ${count} of 3`;',
    'const a = `${parts.length} has`;',
    'const a = n === 1 ? "this insert" : "these inserts";',
    'const a = n > 1 ? "one" : "it";',
    'const a = <span>{plural(parts.length, "part")}</span>;',
    'const a = <span>{name} parts</span>;',
    'const a = `No price on ${plural(lines.length, "line")}`;',
    'const a = `Driving ${plural(n, "screw")} takes an L-key`;',
    'const a = `${plural(n, "joint")} overloaded`;',
    'const a = `${plural(n, "message")} queued`;',
  ],
  invalid: [
    { code: 'const a = `${parts.length} parts`;', errors: bare('parts') },
    { code: 'const a = `Added ${created.length} cutouts`;', errors: bare('cutouts') },
    { code: 'const a = `${n} problems`;', errors: bare('problems') },
    { code: 'const a = `${moving.length} moving joints`;', errors: bare('joints') },
    { code: 'const a = `Select ${count} Parts`;', errors: bare('Parts') },
    { code: 'const a = `${meshCount} meshes`;', errors: bare('meshes') },
    { code: 'const a = `target${n === 1 ? "" : "s"}`;', errors: ternary },
    { code: 'const a = `node${nodes.length > 1 ? "s" : ""}`;', errors: ternary },
    { code: 'const a = `${n} ${n === 1 ? "part" : "parts"}`;', errors: ternary },
    { code: 'const a = <span>{selected.length} parts</span>;', errors: bare('parts') },
    { code: 'const a = `${plural(n, "screw")} need an L-key`;', errors: agrees('need') },
    { code: 'const a = `${plural(lines.length, "line")} have no price`;', errors: agrees('have') },
    { code: 'const a = `${plural(n, "part")} aren’t checked`;', errors: agrees('aren’t') },
    { code: 'const a = <span>{plural(n, "step")} are left</span>;', errors: agrees('are') },
  ],
});

describe('plural rule', () => {
  it('is part of the basecase plugin', () => {
    expect(plugin.rules.plural).toBe(rule);
  });
});
