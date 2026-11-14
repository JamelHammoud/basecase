import { expect, it } from 'vitest';
import { fastenerInput } from '../../assembly/fastenerSpec';
import { objectsOf } from '../../assembly/assembly.fixtures';
import { assemblyIn } from '../../three/analysis/analysisPool';
import { snapshotShapes } from '../../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ProjectSettings } from '../../types/robotics';
import type { Bed } from '../bed';
import { quadrupedFixture } from './merge.fixtures';
import { mergeInput } from './mergeInput';

const BED: Bed = { name: 'Test', width: 256, depth: 256, height: 256, origin: [0, 0], keepOut: [] };

it('plans the quadruped in the worker in under 2 s', async () => {
  const { parts, joints } = quadrupedFixture();
  const project: ProjectSettings = { ...(DEFAULT_PROJECT as ProjectSettings), joints };
  const geometry = await assemblyIn(snapshotShapes(objectsOf(parts)), {
    ...fastenerInput(parts),
    serviceable: [],
    budgetMs: 20000,
    merges: mergeInput(parts, project, BED),
  });

  expect(geometry.ms + geometry.merges!.ms).toBeLessThan(2000);
}, 30000);
