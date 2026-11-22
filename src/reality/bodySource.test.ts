import { expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { physicalParts } from '../appearance/physical';
import { encodeJson } from '../datasets/snapshotWorker';
import { datasetContentHash } from '../datasets/contentHash';
import { bodySourceKey } from './bodyEvidence';
import { bodyProjectUnchanged } from './bodySource';
import { box } from '../sim/fixtures/parts';

const guide = { fingerprint: 'guide-a' } as ProjectSettings['buildGuide'];

it('keeps current body evidence valid when an automatic build guide is saved', async () => {
  const parts = [box('base', [0, 0, 0], [10, 20, 30], 5)];
  const before = await bodySourceKey(parts, DEFAULT_PROJECT);
  const project = { ...DEFAULT_PROJECT, buildGuide: guide };

  expect(await bodySourceKey(parts, project)).toBe(before);
  expect(await bodySourceKey([{ ...parts[0], massG: 8 }], project)).not.toBe(before);
  expect(await bodySourceKey(parts, { ...project, servoCalibrations: {} })).not.toBe(before);
});

it('retains the exact legacy hash including its saved guide metadata', async () => {
  const parts = [box('base', [0, 0, 0], [10, 20, 30], 5)];
  const project = { ...DEFAULT_PROJECT, buildGuide: guide };
  const previous = await datasetContentHash(
    await encodeJson({ parts: physicalParts(parts), project: { ...project, bodyEvidence: undefined } }),
  );

  expect(await bodySourceKey(parts, project, 1)).toBe(previous);
  expect(await bodySourceKey(parts, project, 2)).not.toBe(previous);
});

it('ignores only retained body evidence and guide metadata when checking an active operation', () => {
  const updated = { ...DEFAULT_PROJECT, buildGuide: guide, bodyEvidence: [] };

  expect(bodyProjectUnchanged(DEFAULT_PROJECT, updated)).toBe(true);
  expect(bodyProjectUnchanged(updated, { ...updated, joints: [] })).toBe(false);
  expect(bodyProjectUnchanged(updated, { ...updated, servoCalibrations: {} })).toBe(false);
  expect(bodyProjectUnchanged(updated, { ...updated, bodyCalibrations: {} })).toBe(false);
});
