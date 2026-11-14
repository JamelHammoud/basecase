import { describe, expect, it } from 'vitest';
import { heldBy, namedAreas, stepAreas, stepAreasText } from './stepAreas.mjs';

const body = [
  'Arc: #224',
  'Kind: refine',
  '',
  '**Why.** Copy rule §3b-17 says one word per thing; see §3 and §11.',
  '- **Lint.** `tools/copy/glossary.mjs` maps synonyms; `basecase/copy` reads it through `tools/copy/banned.mjs`.',
  '- Sweep `electron/app-menu.mjs:12`, `./src/cases/` and `AGENTS.md`, keeping "Delete ⟨name⟩?".',
  '- Not paths: `loop:next`, `npm run check:changed -- <files>`, `v2.1`, `0.5`, `~/.basecase-loop/state/`, `__studio`.',
  '- Too broad to be an area, or a package: `src/`, `electron/`, `src/components`, `src/three/`, `@mcap/core`.',
].join('\n');

describe('namedAreas', () => {
  it('finds the backticked paths and § references a step body names', () => {
    expect(namedAreas(body)).toEqual({
      files: [
        'tools/copy/glossary.mjs',
        'basecase/copy',
        'tools/copy/banned.mjs',
        'electron/app-menu.mjs',
        'src/cases/',
        'AGENTS.md',
      ],
      sections: ['§3b', '§3', '§11'],
    });
  });

  it('finds nothing in an empty body', () => {
    expect(namedAreas(undefined)).toEqual({ files: [], sections: [] });
  });
});

const step = (number, files) => ({ number, title: `Step ${number}`, files, sections: [] });
const steps = [
  step(251, ['tools/copy/glossary.mjs', 'electron/app-menu.mjs', 'src/cases/']),
  step(288, ['src/components/SceneMenu.tsx', 'electron/app-menu.mjs']),
];

describe('heldBy', () => {
  it('holds a change confined to files only one waiting step names', () => {
    expect(heldBy(['tools/copy/glossary.mjs', 'src/cases/CaseView.tsx'], steps)?.number).toBe(251);
  });

  it('does not count shared guides, AGENTS.md or help articles against a change', () => {
    const files = ['src/components/SceneMenu.tsx', 'docs/guide/copy.md', 'src/cases/AGENTS.md'];

    expect(heldBy(files, steps)?.number).toBe(288);
    expect(heldBy(['docs/guide/copy.md', 'AGENTS.md', 'site/content/help/print-a-plate.md'], steps)).toBeNull();
  });

  it('publishes a change that reaches past the step, spans two steps, or touches a file two steps name', () => {
    expect(heldBy(['tools/copy/glossary.mjs', 'src/inspector/Inspector.tsx'], steps)).toBeNull();
    expect(heldBy(['tools/copy/glossary.mjs', 'src/components/SceneMenu.tsx'], steps)).toBeNull();
    expect(heldBy(['electron/app-menu.mjs'], steps)).toBeNull();
    expect(heldBy([], steps)).toBeNull();
  });

  it('matches a bare file name or a folder by its place in the path', () => {
    const named = [step(9, ['refine.mjs', 'tools/loop'])];

    expect(heldBy(['tools/loop/briefs/refine.mjs'], named)?.number).toBe(9);
    expect(heldBy(['tools/loop/lanes/merge.mjs'], named)?.number).toBe(9);
    expect(heldBy(['tools/loopy.mjs'], named)).toBeNull();
  });
});

describe('stepAreasText', () => {
  it('lists each step with the files and sections it names', () => {
    const text = stepAreasText([stepAreas({ number: 251, title: 'One word per action', body }), step(300, [])]);

    expect(text).toContain('- #251 One word per action\n  files `tools/copy/glossary.mjs`, `basecase/copy`');
    expect(text).toContain('sections §3b, §3, §11');
    expect(text).toContain('- #300 Step 300');
    expect(stepAreasText([])).toBe('(none)');
  });
});
