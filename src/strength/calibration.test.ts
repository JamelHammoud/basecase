import { describe, expect, it } from 'vitest';
import { linkScene, QUADRUPED_LINKS, SO101_LINKS } from './fixtures/calibration';
import { strengthReport } from './fixtures/run';
import { FACTOR_WARN } from './types';

describe.each([
  ['quadruped', QUADRUPED_LINKS],
  ['SO-101', SO101_LINKS],
])('the %s, at the most torque Servo torque passes', (_, links) => {
  it.each(links.map((l) => [l.name, l] as const))(
    'raises no Fail on the %s',
    async (_name, spec) => {
      const scene = linkScene(spec);
      const { row, readings, jobs } = await strengthReport(scene);

      expect(jobs.map((j) => j.part)).toEqual([spec.id]);
      expect(jobs[0].load.torqueNmm / 1000).toBeGreaterThan(scene.torqueNm * 0.9);
      expect(readings[0]!.factor).toBeGreaterThanOrEqual(FACTOR_WARN);
      expect(row!.status).not.toBe('fail');
    },
    60000,
  );
});
