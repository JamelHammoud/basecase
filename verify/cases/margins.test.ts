import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { galleryBundles } from '../../src/gallery/galleryEntries';
import { casesFor, GALLERY_MINIMUM, judgePlay, PLAY_ROBOTS, playRobot } from './play';

describe('every Case the app offers: limp margin negative, reference margin positive', () => {
  for (const id of PLAY_ROBOTS) {
    it(`${id}: every fitting example and every New Case goal and world`, async () => {
      const mj = await loadMujoco();
      const robot = playRobot(id);
      const { cases, problems } = casesFor(robot);

      expect(cases.length, `${id} is offered no Case`).toBeGreaterThan(0);

      for (const { name, kase } of cases) {
        for (const p of await judgePlay(mj, kase, robot)) problems.push(`${name}: ${p}`);
      }

      expect(problems).toEqual([]);
    }, 1_800_000);
  }

  it(`every gallery Case on its bundled robot, at least ${GALLERY_MINIMUM} of them`, async () => {
    const mj = await loadMujoco();
    const bundles = galleryBundles();
    const problems: string[] = [];

    expect(bundles.length).toBeGreaterThanOrEqual(GALLERY_MINIMUM);

    for (const bundle of bundles) {
      const { parts, joints } = bundle.robot;
      const robot = { id: bundle.slug, parts, joints, expect: { morphology: '', stand: 'n/a', walk: 'n/a' } as const };

      for (const p of await judgePlay(mj, bundle.case, robot)) problems.push(`${bundle.slug}: ${p}`);
    }

    expect(problems).toEqual([]);
  }, 900_000);
});
