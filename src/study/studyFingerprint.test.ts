import { expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { studyFingerprint } from './study';

const guide = {
  id: 'original',
  pages: 1,
  steps: 1,
  generatedAt: '2026-11-22T00:00:00Z',
  fingerprint: 'guide',
  stepParts: { fingerprint: 'parts', ids: [['part']] },
};
const project = { ...DEFAULT_PROJECT, buildGuide: guide };

it('keeps Study identity when generated guide records and body evidence change', () => {
  const original = studyFingerprint([], project);

  expect(
    studyFingerprint([], {
      ...project,
      buildGuide: { ...guide, id: 'regenerated', generatedAt: '2026-11-22T00:00:01Z', pages: 2 },
      bodyEvidence: [],
    }),
  ).toBe(original);
});

it('keeps physical settings and assembly step assignments in Study identity', () => {
  const original = studyFingerprint([], project);

  expect(studyFingerprint([], { ...project, infillPct: 99 })).not.toBe(original);
  expect(
    studyFingerprint([], {
      ...project,
      buildGuide: { ...guide, stepParts: { fingerprint: 'changed', ids: [['other-part']] } },
    }),
  ).not.toBe(original);
});
