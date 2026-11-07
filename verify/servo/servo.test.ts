import fs from 'node:fs';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fitFopd, rms } from './metrics';
import { CATALOG_SERVOS, pendulumModel, plantCanary, runPendulum } from './pendulum';

interface BamRun {
  servo: string;
  volts: number;
  massKg: number;
  armM: number;
  profile: string;
  command: number[];
  position: number[];
}

interface BamReference {
  source: string;
  sampleS: number;
  gravity: number;
  bobSideM: number;
  runs: BamRun[];
}

const OUT = path.resolve('verify/out/servo');
const reference = JSON.parse(fs.readFileSync(path.join(OUT, 'bam.json'), 'utf8')) as BamReference;
const PROFILES = ['step', 'chirp', 'multisine', 'hold'];
const scores: Array<Record<string, number | string>> = [];

describe('the BAM reference covers every servo, load and profile', () => {
  it('has two servos, two masses, two arms and four profiles', () => {
    expect(new Set(reference.runs.map((r) => r.servo))).toEqual(new Set(Object.keys(CATALOG_SERVOS)));
    expect(new Set(reference.runs.map((r) => r.profile))).toEqual(new Set(PROFILES));
    expect(reference.runs).toHaveLength(2 * 2 * 2 * PROFILES.length);
    expect(reference.gravity).toBeCloseTo(9.81, 6);
  });
});

describe('sim tracks BAM better than half the teleport baseline and better than a fitted FOPD', () => {
  for (const run of reference.runs) {
    const label = `${run.servo} ${run.massKg} kg ${run.armM} m ${run.profile}`;

    it(label, async () => {
      const mj = await loadMujoco();
      const model = plantCanary(
        pendulumModel(CATALOG_SERVOS[run.servo], { massKg: run.massKg, armM: run.armM, bobSideM: reference.bobSideM }),
      );
      const sim = runPendulum(mj, model, run.command);
      const simRms = rms(sim, run.position);
      const teleport = rms(run.command, run.position);
      const fopd = fitFopd(run.command, run.position, reference.sampleS);

      scores.push({ run: label, sim: simRms, teleport, fopd: fopd.rms, tau: fopd.tau, delay: fopd.delay });
      fs.writeFileSync(path.join(OUT, 'scores.json'), `${JSON.stringify(scores, null, 2)}\n`);

      expect(model.joints[0].dynamics).toBe('measured');
      expect(simRms).toBeLessThanOrEqual(0.5 * teleport);
      expect(simRms).toBeLessThanOrEqual(fopd.rms);
    });
  }
});
