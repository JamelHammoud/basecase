import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fitFopd, fopdResponse, rms } from '../servo/metrics';
import { calibratedModel, loadCalibrator } from './calibrate';
import { nadLogs, type NadLog } from './nad';
import { HiddenTwin } from './plant';
import { predict, presetModel } from './sim';
import { drawUnit } from './units';
import { freshSeed, seededRng } from '../zoo/rng';

const TELEPORT_SHARE = 0.5;
const ANCHOR_RANGE = [0.5, 2] as const;

const byJoint = (logs: NadLog[]) =>
  logs.reduce((m, l) => m.set(l.joint, [...(m.get(l.joint) ?? []), l]), new Map<string, NadLog[]>());

function fopdError(train: NadLog[], held: NadLog): number {
  const fits = train.map((t) => fitFopd(t.log.goalRad, t.log.positionRad, t.log.dt));
  const tau = fits.reduce((s, f) => s + f.tau, 0) / fits.length;
  const delay = fits.reduce((s, f) => s + f.delay, 0) / fits.length;
  const out = fopdResponse(held.log.goalRad, held.log.positionRad[0], { tau, delay, dt: held.log.dt });

  return rms(out, held.log.positionRad);
}

describe('Stage 6 on public SO-101 logs (NAD)', () => {
  it('leave one payload out: the calibrated sim beats half the teleport error and a fitted FOPD, per joint', async () => {
    const mj = await loadMujoco();
    const mod = await loadCalibrator();
    const problems: string[] = [];

    for (const [joint, logs] of byJoint(await nadLogs())) {
      for (const held of logs) {
        const train = logs.filter((l) => l.payload !== held.payload);
        const calibration = await mod.calibrateServo({ family: 'sts3215', logs: train.map((t) => t.log) });
        const sim = rms(
          predict(mj, calibratedModel(mod, 'sts3215', calibration)(held.log.payload), held.log),
          held.log.positionRad,
        );
        const teleport = rms(held.log.goalRad, held.log.positionRad);
        const fopd = fopdError(train, held);

        if (sim > TELEPORT_SHARE * teleport || sim > fopd)
          problems.push(
            `${joint} without ${held.payload}: sim ${sim.toFixed(4)}, teleport ${teleport.toFixed(4)}, FOPD ${fopd.toFixed(4)}`,
          );
      }
    }

    expect(problems).toEqual([]);
  }, 3_600_000);

  it('the hidden twin’s gap to the sim matches the sim-to-log gap within 0.5x to 2x, per joint and payload', async () => {
    const mj = await loadMujoco();
    const rng = seededRng(freshSeed());
    const problems: string[] = [];

    for (const nad of await nadLogs()) {
      const preset = presetModel('sts3215', nad.log.payload);
      const sim = predict(mj, preset, nad.log);
      const twin = new HiddenTwin(drawUnit(rng, 'sts3215'), nad.log.positionRad[0]).run(
        nad.log.goalRad,
        nad.log.payload,
      );
      const ratio = rms(sim, twin.positionRad) / rms(sim, nad.log.positionRad);

      if (ratio < ANCHOR_RANGE[0] || ratio > ANCHOR_RANGE[1])
        problems.push(`${nad.joint} with ${nad.payload}: twin gap is ${ratio.toFixed(2)}x the real gap`);
    }

    expect(problems).toEqual([]);
  }, 3_600_000);
});
