import loadMujoco from '@mujoco/mujoco';
import type { Page } from 'playwright-core';
import { expect } from 'vitest';
import { encodeRecording } from '../src/cases/recordingFile';
import { referenceTry, touchTheDots } from '../src/cases/testing';
import { storedTryOf, type StoredTry } from '../src/cases/tryFile';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import type { Studio } from './driveStudio';

type SeedStudio = Studio & { keepStoredTries: (tries: StoredTry[]) => Promise<void> };

export async function loadMultiplyTry(page: Page) {
  const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const kase = touchTheDots(robot);
  const { record, source, verdict } = await referenceTry(await loadMujoco(), kase, robot);
  const sceneId = 'multiply-test';
  const manifest = storedTryOf(record, {
    sceneId,
    caseName: kase.name,
    joints: robot.joints.map((j) => j.id),
  });

  expect(verdict.passed).toBe(true);
  await page.evaluate(
    async ({ manifest, recording, scene }) => {
      const studio = (window as unknown as { __studio: SeedStudio }).__studio;

      await studio.keepStoredTries([manifest]);

      const response = await fetch('/api/bridge/tries-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arg: { manifest, recording } }),
      });

      if (!response.ok) throw new Error('Could not seed the Multiply recording');

      studio.load(scene);
    },
    {
      manifest,
      recording: Buffer.from(encodeRecording(source.recording)).toString('base64'),
      scene: {
        id: sceneId,
        name: sceneId,
        parts: robot.parts,
        project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase], tries: [record], triesStored: true },
      },
    },
  );

  return kase;
}
