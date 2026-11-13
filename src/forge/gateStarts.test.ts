import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import { kitJob } from '../skills/kitJob';
import { settleStart } from './forgeStart';
import { gateStart, Rng } from './gateStarts';
import { replayStarts, type ReplayJob } from './walkReplay';

const RUST_UNITS = [1.26140176078774924e-1, 9.52481421283124741e-1, 3.8784926731910585e-2];
const RUST_UNIT_STREAM_31 = 3.95234366859257835e-1;

const SPEC = {
  qpos: [0.1, -0.2, 0.3, 0.9238795325112867, 0, 0, 0.3826834323650898, 0.4, -0.7, 1.2],
  rootQpos: 0,
  jointQpos: [7, 8, 9],
  ctrlLow: [-0.5, -0.75, -1.0],
  ctrlHigh: [0.5, 0.75, 1.21],
  noise: 0.05,
  seed: 7,
};

const RUST_STARTS: Record<number, number[]> = {
  0: [
    0.1, -0.2, 0.3, 9.71913318677518734e-1, 0, 0, -2.35339119096787674e-1, 4.15325471086856579e-1,
    -6.69435512095899354e-1, 1.15430176428635423,
  ],
  5: [
    0.1, -0.2, 0.3, 6.56643187505662529e-1, 0, 0, 7.5420138179560714e-1, 4.0019485085982659e-1, -7.1536789637331899e-1,
    1.21,
  ],
  31: [
    0.1, -0.2, 0.3, 7.39365693565370963e-1, 0, 0, 6.7330407037132789e-1, 3.98827192310044487e-1,
    -7.25532884445768689e-1, 1.15468991493268369,
  ],
};

const worst = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

const foldedYaw = (q: number[]) => {
  const yaw = 2 * Math.atan2(q[3], q[0]);
  const quarter = Math.PI / 2;

  return ((yaw % quarter) + quarter) % quarter;
};

describe('the WASM replay draws its starts as the C judge does', () => {
  it('matches the C judge’s random streams bit for bit', () => {
    const rng = new Rng(1003, 0);

    expect(RUST_UNITS.map(() => rng.unit())).toEqual(RUST_UNITS);
    expect([new Rng(1003, 31).unit()]).toEqual([RUST_UNIT_STREAM_31]);
  });

  it('matches the C judge’s noisy, turned starts to 1e-9, clamped joints included', () => {
    for (const [robot, want] of Object.entries(RUST_STARTS)) {
      expect(worst(gateStart(SPEC, Number(robot)), want)).toBeLessThan(1e-9);
    }
  });

  it('gives 32 distinct starts even with yaw folded by 90°', async () => {
    const mj = await loadMujoco();
    const fixture = fixtureModel('quad-servo');
    const job = {
      ...kitJob(fixture, 'stand', { minutes: 1, seed: 3 }),
      gateSpeed: 0.2,
      seed: 3,
    } as unknown as ReplayJob;
    const model = mj.MjModel.from_xml_string(fixture.xml);

    try {
      const root = model.jnt_qposadr[mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT.value, job.root)];
      const starts = replayStarts(mj, model, { job, start: settleStart(mj, model, job), seeds: 32 });
      const keys = starts.map((q) =>
        [foldedYaw(q.slice(root + 3, root + 7)), ...q.slice(root + 7)].map((v) => v.toFixed(6)).join(' '),
      );

      expect(new Set(keys).size).toBe(32);
    } finally {
      model.delete();
    }
  });
});
