import { describe, expect, it } from 'vitest';
import { parseJustifications } from '../../copy/budget.mjs';
import { normalize } from '../../copy/extract.mjs';
import { KINDS, kindOf, pullBody, revisedBody } from './pull.mjs';

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

  it.each(Object.keys(KINDS))('ends a %s body with its closing line, whatever its template holds', (kind) => {
    const body = pullBody({ ...change(kind, []), links: ['Closes #54.'] }, { branch: 'loop/test' });

    expect(body.trimEnd().endsWith('Closes #54.')).toBe(true);
  });

  it('leaves the Copy section out of a body whose template lacks it when nothing was added', () => {
    expect(pullBody(change('fix', []), { branch: 'loop/test' })).not.toContain('## Copy');
  });
});

describe('the changelog section', () => {
  it.each(['feature', 'integration'])('carries the line in a %s body', (kind) => {
    expect(pullBody({ ...change(kind, []), changelog: 'Publish datasets' }, { branch: 'b' })).toContain(
      '## Changelog\n\nPublish datasets',
    );
  });

  it.each(['refine', 'fix'])('reads None in a %s body, which never gets an entry', (kind) => {
    const body = pullBody({ ...change(kind, []), changelog: 'Layers shows long names' }, { branch: 'b' });

    expect(body).toContain('## Changelog\n\n_None._');
    expect(body).not.toContain('Layers shows long names');
  });
});

describe('revisedBody', () => {
  const opened = `${pullBody(
    { ...change('feature', []), changelog: 'Calibrate servos from Operate' },
    { branch: 'b', protectedPaths: ['.github/workflows/check.yml'] },
  )}\n\n## Revisions\n\n- Added the help article.`;

  it('adds the copy reasons a revision gives, so Check can read them', () => {
    const body = revisedBody(opened, { ...change('feature', copy), changelog: 'Calibrate' }, { branch: 'b' });

    expect(parseJustifications(body).get(normalize('Print failed: ${reason}'))).toBe(
      'Names the failure so it can be fixed.',
    );
    expect(body).not.toContain('## Copy\n\n_None._');
  });

  it('drops a withdrawn changelog line and keeps the sections the revision does not restate', () => {
    const body = revisedBody(opened, change('feature', []), { branch: 'b' });

    expect(body).toContain('## Changelog\n\n_None._');
    expect(body).not.toContain('Calibrate servos from Operate');
    expect(body).toContain('## Why\n\nPeople could not tell why a print stopped.');
    expect(body).toMatch(/## Protected paths\n\n.*check\.yml/);
    expect(body.endsWith('## Revisions\n\n- Added the help article.')).toBe(true);
  });

  it('adds a Copy section ahead of Revisions to a body whose template lacks one', () => {
    const fix = `${pullBody(change('fix', []), { branch: 'b' })}\n\n## Revisions\n\n- First pass.`;
    const body = revisedBody(fix, change('fix', copy), { branch: 'b' });

    expect(body.indexOf('## Copy')).toBeGreaterThan(body.indexOf('## Changelog'));
    expect(body.indexOf('## Copy')).toBeLessThan(body.indexOf('## Revisions'));
    expect(body.match(/^## Copy$/gm)).toHaveLength(1);
  });

  it('reads the kind from the title prefix', () => {
    expect(kindOf('Refine: Trim the Build pane')).toBe('refine');
    expect(kindOf('Integration: Export a robot')).toBe('integration');
    expect(kindOf('Trim the Build pane')).toBeNull();
  });
});
