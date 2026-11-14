import { describe, expect, it } from 'vitest';
import { buildCase, builderRobot } from '../../cases/caseBuilder';
import { stageCase } from '../../cases/caseCast';
import { caseMat, type CaseMat } from '../../cases/mat/matLayout';
import { matCamera, shoot, type CameraSetup } from '../../cases/mat/matTesting';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig } from '../../utils/kinematics';
import type { BaseFix } from './matSolve';
import { MAT_SCALE_REFUSAL, type MatSample } from './matTracker';

const SECONDS = 1;

function roverMat(): CaseMat {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const rig = buildRig(rover.joints, rover.parts);
  const built = buildCase({ goal: 'reach', world: 'floor' }, builderRobot(rig, rover.parts));

  if (!built.ok) throw new Error(built.problem);

  return caseMat(stageCase(built.kase, { rig, parts: rover.parts }, []).kase, { rig, parts: rover.parts }, 'a4')!;
}

const mat = roverMat();

const restYaw = Math.atan2(mat.base.up[0], mat.base.up[1]);

const moving = (t: number): BaseFix => ({
  x: mat.base.center[0] + 40 * t,
  z: mat.base.center[2] + 300 * t,
  yaw: restYaw + 0.3 * t,
});

const worst = (samples: MatSample[]) =>
  Math.max(
    ...samples.map((s) => {
      const truth = moving(s.t);

      return s.base ? Math.hypot(s.base.x - truth.x, s.base.z - truth.z) : Infinity;
    }),
  );

const track = (setup: CameraSetup, extra: Partial<Parameters<typeof shoot>[0]> = {}) =>
  shoot({
    mat,
    camera: matCamera(mat, setup),
    seconds: SECONDS,
    pose: moving,
    width: 960,
    height: 540,
    fps: 5,
    ...extra,
  });

describe('tracking the base on a printed mat', { timeout: 30_000 }, () => {
  it('tracks with only two mat tags in view', async () => {
    const [first, second] = mat.tags;
    const { samples } = await track({}, { keep: (id) => id === first.id || id === second.id || id === mat.base.id });

    expect(worst(samples)).toBeLessThan(15);
    expect(samples.every((s) => s.tags === 2)).toBe(true);
  });

  it('tracks from a camera tilted 40°', async () => {
    const { samples } = await track({ tiltDeg: 40, rollDeg: 10 });

    expect(worst(samples)).toBeLessThan(10);
  });

  it('tracks through a phone-like wide lens', async () => {
    const { samples } = await track({ lens: { model: 'pinhole', hfovDeg: 100 }, tiltDeg: 30 });

    expect(worst(samples)).toBeLessThan(10);
  });

  it('refuses a mat printed at 97% instead of mis-measuring it', async () => {
    const { samples, refusal } = await track({}, { printScale: 0.97 });

    expect(refusal).toBe(MAT_SCALE_REFUSAL);
    expect(samples.filter((s) => s.base).length).toBeLessThan(samples.length / 2);
    expect(samples.at(-1)?.base).toBeNull();
  });

  it('gives the same trace for the same frames', async () => {
    const [a, b] = [await track({}), await track({})];

    expect(b.samples).toEqual(a.samples);
  });
});
