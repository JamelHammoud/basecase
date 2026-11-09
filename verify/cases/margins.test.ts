import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { galleryBundles } from '../../src/gallery/galleryEntries';
import { casesFor, judgePlay, PLAY_ROBOTS, playRobot } from './play';

describe('every Case the app offers: limp margin negative, reference margin positive', () => {
  for (const id of PLAY_ROBOTS) {
    it(`${id}: every fitting example and every New Case goal and world`, async () => {
      const mj = await loadMujoco();
      const robot = playRobot(id);
      const cases = casesFor(robot);
      const problems: string[] = [];

      expect(cases.length, `${id} is offered no Case`).toBeGreaterThan(0);

      for (const { name, kase } of cases) {
        for (const p of await judgePlay(mj, kase, robot)) problems.push(`${name}: ${p}`);
      }

      expect(problems).toEqual([]);
    }, 1_800_000);
  }

  it('every gallery Case on its bundled robot', async () => {
    const mj = await loadMujoco();
    const problems: string[] = [];

    for (const bundle of galleryBundles()) {
      const { parts, joints } = bundle.robot;
      const robot = { id: bundle.slug, parts, joints, expect: { morphology: '', stand: 'n/a', walk: 'n/a' } as const };

      for (const p of await judgePlay(mj, bundle.case, robot)) problems.push(`${bundle.slug}: ${p}`);
    }

    expect(problems).toEqual([]);
  }, 900_000);
});
