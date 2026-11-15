import { describe, expect, it } from 'vitest';
import { pullBody, revisedBody } from './pull.mjs';
import { rebuildChange } from './rebuild.mjs';
import { stepsOf } from './stepLinks.mjs';
import { laneStats } from './laneStats.mjs';
import { keepsMarkers } from '../../voice/voice.mjs';
import { kindOf } from './evidence.mjs';

const change = {
  kind: 'refine',
  title: 'Keep step links',
  summary: 'Links survive.',
  why: 'Revisions dropped links.',
  checked: 'Regression tests.',
  copy: [],
  screenshots: [],
};
const options = { branch: 'loop/build/605-1-import', slug: 'example/basecase' };

describe('step identity through body rewrites', () => {
  it('revises every template then rebuilds with its step and provenance intact', () => {
    for (const kind of [
      'feature',
      'integration',
      'fix',
      'repair',
      'refine',
      'lesson',
      'harness',
      'loop',
      'update',
      'market',
    ]) {
      const original = pullBody({ ...change, kind, links: ['Closes #605.', 'Rebuilds #698.'] }, options);
      const body = revisedBody(`${original}\n\n## Revisions\n\n- First pass.`, { ...change, kind }, options);
      const rebuilt = rebuildChange({ number: 719, body, headRefName: 'loop/rebuild/import', labels: [] }, change);

      expect(body).toContain('Closes #605.');
      expect(body).toContain('Rebuilds #698.');
      expect(rebuilt.links).toContain('Closes #605.');
      expect(rebuilt.links).toContain('Rebuilds #719.');
      expect(stepsOf({ body: '', labels: [{ name: 'loop:step:605' }] })).toEqual([605]);
    }
  });

  it('rebuilds from runner labels when the body has no link, and from an old build branch', () => {
    expect(rebuildChange({ number: 719, body: '', labels: [{ name: 'loop:step:605' }] }, change).links).toContain(
      'Closes #605.',
    );
    expect(rebuildChange({ number: 698, body: '', headRefName: options.branch }, change).links).toContain(
      'Closes #605.',
    );
  });

  it('rejects a voice rewrite that drops a rebuild link', () => {
    expect(keepsMarkers('Closes #605.\nRebuilds #698.', 'Closes #605.', 'pull')).toBe(false);
  });

  it('counts time from the step for a rebuilt merge whose prose has no closing line', () => {
    const lanes = laneStats({
      pulls: [
        {
          number: 719,
          headRefName: 'loop/rebuild/import',
          body: '## Revisions',
          labels: [{ name: 'loop:step:605' }],
          createdAt: '2026-11-14T10:00:00Z',
          mergedAt: '2026-11-14T12:00:00Z',
        },
      ],
      steps: [{ number: 605, labels: [{ name: 'loop:next' }], createdAt: '2026-11-13T12:00:00Z' }],
      comments: [],
      commits: [],
      owner: 'example',
      from: '2026-11-13',
      to: '2026-11-15',
    });

    expect(lanes.rebuild.mergeHours).toBe(24);
  });
});

it('does not mistake a runner step label for the pull request kind', () => {
  expect(kindOf({ labels: [{ name: 'loop:step:605' }, { name: 'loop:integration' }] })).toBe('integration');
});
