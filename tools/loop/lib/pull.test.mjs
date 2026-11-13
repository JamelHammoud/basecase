import { describe, expect, it } from 'vitest';
import { parseJustifications } from '../../copy/budget.mjs';
import { normalize } from '../../copy/extract.mjs';
import { landedFrom } from './landed.mjs';
import { KINDS, kindOf, pullBody, revisedBody } from './pull.mjs';

const change = (kind, copy) => ({
  kind,
  title: 'Show the reason a print failed',
  summary: 'The print toast names the failure.',
  why: 'People could not tell why a print stopped.',
  cause: 'The error was dropped.',
  checked: 'A unit test.',
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

const ENTRY = 'site/content/changelog/2026-11-12-publish-datasets.md';
const ENTRY_SOURCE = `---
title: Publish datasets to Hugging Face
date: 2026-11-12
image: /changelog/publish-datasets/cover.png
---

Publish a Case's passed tries to the Hub from Results. It opens in LeRobot as is.

## Where it is

Results has the button.
`;

const landed = (files, onDisk = files) =>
  landedFrom(files, { read: () => ENTRY_SOURCE, exists: (file) => onDisk.includes(file) });

describe('the changelog section', () => {
  it.each(Object.keys(KINDS))('names the entry a %s diff adds, by title and first sentence', (kind) => {
    const body = pullBody(change(kind, []), { branch: 'b', landed: landed([ENTRY, 'src/a.ts']) });

    expect(body).toContain(
      `## Changelog\n\n**Publish datasets to Hugging Face** (\`${ENTRY}\`)\nPublish a Case's passed tries to the Hub from Results.`,
    );
  });

  it('reads None when the diff adds no entry', () => {
    expect(pullBody(change('feature', []), { branch: 'b', landed: landed(['src/a.ts']) })).toContain(
      '## Changelog\n\n_None._',
    );
  });
});

describe('the screenshots section', () => {
  const shot = 'site/public/help/publish/results.png';
  const cover = 'site/public/changelog/publish-datasets/cover.png';

  it('shows every image the diff adds, even when the answer lists none', () => {
    const body = pullBody(change('refine', []), { branch: 'b', landed: landed([shot, cover, 'src/a.ts']) });

    expect(body).toContain(`raw/b/${shot})`);
    expect(body).toContain(`raw/b/${cover})`);
    expect(body).not.toContain('## Screenshots\n\n_None._');
  });

  it('drops a listed screenshot that is not on the branch, and lists each image once', () => {
    const answer = { ...change('feature', []), screenshots: [shot, 'site/public/help/calibrate/missing.png'] };
    const body = pullBody(answer, { branch: 'b', landed: landed([shot]) });

    expect(body).not.toContain('missing.png');
    expect(body.split(`raw/b/${shot})`)).toHaveLength(2);
  });

  it('keeps a listed screenshot an earlier commit on the branch added', () => {
    const answer = { ...change('refine', []), screenshots: [shot] };

    expect(pullBody(answer, { branch: 'b', landed: landed([], [shot]) })).toContain(`raw/b/${shot})`);
  });
});

describe('revisedBody', () => {
  const opened = `${pullBody(change('feature', []), {
    branch: 'b',
    protectedPaths: ['.github/workflows/check.yml'],
    landed: landed([ENTRY]),
  })}\n\n## Revisions\n\n- Added the help article.`;

  it('adds the copy reasons a revision gives, so Check can read them', () => {
    const body = revisedBody(opened, change('feature', copy), { branch: 'b', landed: landed([ENTRY]) });

    expect(parseJustifications(body).get(normalize('Print failed: ${reason}'))).toBe(
      'Names the failure so it can be fixed.',
    );
    expect(body).not.toContain('## Copy\n\n_None._');
  });

  it('drops the changelog line once the diff no longer adds the entry, and keeps Protected paths', () => {
    const body = revisedBody(opened, change('feature', []), { branch: 'b', landed: landed(['src/a.ts']) });

    expect(opened).toContain('Publish datasets to Hugging Face');
    expect(body).toContain('## Changelog\n\n_None._');
    expect(body).not.toContain('Publish datasets to Hugging Face');
    expect(body).toMatch(/## Protected paths\n\n.*check\.yml/);
    expect(body.endsWith('## Revisions\n\n- Added the help article.')).toBe(true);
  });

  it('rewrites Why from the revision, so a body never keeps the reasons of a branch main has moved past', () => {
    const body = revisedBody(
      opened,
      { ...change('feature', []), why: 'Main already has the hover card cuts.' },
      { branch: 'b' },
    );

    expect(body).toContain('## Why\n\nMain already has the hover card cuts.');
    expect(body).not.toContain('People could not tell why a print stopped.');
  });

  it('adds a Copy section ahead of Revisions to a body whose template lacks one', () => {
    const fix = `${pullBody(change('fix', []), { branch: 'b' })}\n\n## Revisions\n\n- First pass.`;
    const body = revisedBody(fix, change('fix', copy), { branch: 'b' });

    expect(body.indexOf('## Copy')).toBeGreaterThan(body.indexOf('## Changelog'));
    expect(body.indexOf('## Copy')).toBeLessThan(body.indexOf('## Revisions'));
    expect(body.match(/^## Copy$/gm)).toHaveLength(1);
  });

  it('adds the Changelog and Screenshots a fix diff brings, and clears them when a revision drops them', () => {
    const shot = 'site/public/help/print/failed.png';
    const opened = pullBody(change('fix', []), { branch: 'b', landed: landed([ENTRY, shot]) });
    const body = revisedBody(opened, change('fix', []), { branch: 'b', landed: landed(['src/a.ts']) });

    expect(opened).toContain('## Changelog\n\n**Publish datasets to Hugging Face**');
    expect(opened).toContain(`raw/b/${shot})`);
    expect(body).toContain('## Changelog\n\n_None._');
    expect(body).toContain('## Screenshots\n\n_None._');
  });

  it('reads the kind from the title prefix', () => {
    expect(kindOf('Refine: Trim the Build pane')).toBe('refine');
    expect(kindOf('Integration: Export a robot')).toBe('integration');
    expect(kindOf('Trim the Build pane')).toBeNull();
  });
});
