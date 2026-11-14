import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.BASECASE_LOOP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'refine-lane-'));

const { refineIdeas } = await import('../lib/refines.mjs');
const { default: refine, promptFor } = await import('./refine.mjs');
const { stepAreas } = await import('../lib/stepAreas.mjs');

const marks = stepAreas({
  number: 251,
  title: 'Use one word per action everywhere',
  body: 'Sweep `src/annotations/MarksMenu.tsx` and `electron/app-menu.mjs`, per §3b.',
});
const save = stepAreas({ number: 288, title: 'Fold Save into the File menu', body: 'Change `src/tabs/SaveRow.tsx`.' });

function world({ files = ['src/annotations/MarksMenu.tsx'], output = {} } = {}) {
  const calls = { published: [], prompts: [], log: [] };

  return {
    calls,
    log: (line) => calls.log.push(line),
    deps: {
      inFlight: () => ({ open: [{ number: 700, title: 'Feature: Scan a room' }], merged: [] }),
      ownedSteps: () => [marks, save],
      openRefines: () => [{ number: 701, title: 'Refine: Show every torque in one format' }],
      mergedRefines: () => [{ number: 640, title: 'Refine: Call taking a supply off the BOM Delete' }],
      ideas: {
        all: () => [{ key: '640', idea: 'Delete is the word for taking a supply off the bill of materials.' }],
        save: () => {},
      },
      checkedRun: ({ prompt }) => {
        calls.prompts.push(prompt);

        return {
          ok: true,
          output: { changed: true, title: 'Call it Delete', summary: 'One word.', notes: '', ...output },
        };
      },
      publish: (change) => {
        calls.published.push(change);

        return 'https://github.com/o/r/pull/702';
      },
      changedFiles: () => files,
      openBranch: () => ({ dir: 'worktree', branch: 'loop/refine/fit' }),
      close: () => {},
    },
  };
}

describe('the refine prompt', () => {
  it('lists the waiting steps with their named files and the last 14 days of refines', () => {
    const prompt = promptFor(world().deps);

    expect(prompt).toContain('- #700 (open) Feature: Scan a room');
    expect(prompt).toContain(
      '- #251 Use one word per action everywhere\n  files `src/annotations/MarksMenu.tsx`, `electron/app-menu.mjs`; sections §3b',
    );
    expect(prompt).toContain('- #288 Fold Save into the File menu\n  files `src/tabs/SaveRow.tsx`');
    expect(prompt).toContain('- #701 (open) Refine: Show every torque in one format');
    expect(prompt).toContain(
      '- #640 (merged) Refine: Call taking a supply off the BOM Delete\n  Delete is the word for taking a supply off the bill of materials.',
    );
  });
});

describe('the refine guard', () => {
  it("holds a change confined to one waiting step's files and names the step", () => {
    const { deps, log, calls } = world();

    refine({ log }, deps);

    expect(calls.published).toEqual([]);
    expect(calls.log).toEqual([
      'not publishing: every file it changes belongs to step #251 (Use one word per action everywhere)',
    ]);
  });

  it('publishes a change that reaches past the step, whatever shared guides it also touches', () => {
    const { deps, log, calls } = world({
      files: ['src/inspector/Inspector.tsx', 'docs/guide/copy.md', 'AGENTS.md', 'src/annotations/MarksMenu.tsx'],
    });

    refine({ log }, deps);

    expect(calls.published).toHaveLength(1);
    expect(calls.log).toEqual(['opened https://github.com/o/r/pull/702']);
  });
});

describe('the refine record', () => {
  it('stores the idea of each published refine and reads it back', () => {
    const { deps, log } = world({
      files: ['src/inspector/Inspector.tsx'],
      output: { summary: 'Every removal is called Delete, in one place. Gone: Clear, Erase.' },
    });

    refine({ log }, { ...deps, ideas: refineIdeas });

    expect(refineIdeas.get(702)).toMatchObject({
      title: 'Refine: Call it Delete',
      idea: 'Every removal is called Delete, in one place.',
    });
    expect(refineIdeas.all()).toEqual([expect.objectContaining({ key: '702', title: 'Refine: Call it Delete' })]);
  });
});
