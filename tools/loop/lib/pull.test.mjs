import { describe, expect, it } from 'vitest';
import { parseJustifications } from '../../copy/budget.mjs';
import { normalize } from '../../copy/extract.mjs';
import { KINDS, pullBody } from './pull.mjs';

const change = (kind, copy) => ({
  kind,
  title: 'Show the reason a print failed',
  summary: 'The print toast names the failure.',
  why: 'People could not tell why a print stopped.',
  cause: 'The error was dropped.',
  checked: 'A unit test.',
  changelog: '',
  screenshots: [],
  copy,
});

const copy = [{ string: 'Print  failed:\n${reason}', why: 'Names the failure\nso it can be fixed.' }];

describe('pullBody', () => {
  it.each(Object.keys(KINDS))('puts the copy lines in a %s body', (kind) => {
    const body = pullBody(change(kind, copy), { branch: 'loop/test' });

    expect(body).toContain('copy: "Print failed: ${reason}" — Names the failure so it can be fixed.');
    expect(parseJustifications(body).get(normalize('Print failed: ${reason}'))).toBe(
      'Names the failure so it can be fixed.',
    );
    expect(body.match(/^## Copy$/gm)).toHaveLength(1);
  });

  it('leaves the Copy section out of a body whose template lacks it when nothing was added', () => {
    expect(pullBody(change('fix', []), { branch: 'loop/test' })).not.toContain('## Copy');
  });
});
