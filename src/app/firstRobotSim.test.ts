import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { livePlayer } from '../cases/referencePlayer';
import { worldItem } from '../cases/schema';
import { galleryBundles } from '../gallery/galleryEntries';
import { driveAccess } from '../sim/driveAccess';
import { sameCommand } from '../sim/driveKeys';
import type { DriveCommand } from '../sim/driveTypes';
import { SimEngine } from '../sim/engine';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import { buildRig } from '../utils/kinematics';
import { FIRST_ROBOT, seedFromBundle } from './firstLaunch';

const FRAME_S = 1 / 60;
const SETTLE_S = 2;

async function runFirstRobot() {
  const mj = await loadMujoco();
  const seed = seedFromBundle(galleryBundles().find((b) => b.slug === FIRST_ROBOT)!);
  const kase = seed.project!.cases![0];
  const { parts } = seed;
  const rig = buildRig(seed.project?.joints ?? [], parts);
  const model = buildMjcf({
    parts,
    rig,
    project: seed.project!,
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
    world: kase.world.objects.map(worldItem),
  });
  const access = driveAccess({ rig, parts, model });

  if (access.kind !== 'ready') throw new Error(`No scripted drive: ${access.kind}`);

  const engine = new SimEngine(mj, model);
  const share = () => model.joints.map((j) => Math.abs(engine.data.actuator_force[j.actuator]) / j.effort);
  let command: DriveCommand = { v: [0, 0, 0] };
  let sent = command;
  let worstTilt = 0;
  const player = livePlayer({ kase, rig, parts, model, send: (next) => (command = next) });

  engine.setController({ kind: 'drive', setup: access.setup });

  for (let t = 0; t < kase.task.seconds + SETTLE_S; t += FRAME_S) {
    player.tick(t, engine.poses());

    if (!sameCommand(command, sent)) {
      sent = command;
      engine.command(command);
    }

    engine.step(FRAME_S);
    worstTilt = Math.max(worstTilt, engine.stats().robots[0].tilt);
  }

  const stats = engine.stats();
  const idle = share();

  engine.dispose();

  return { robot: stats.robots[0], joints: stats.joints, idle, worstTilt };
}

describe('the first-launch rover', () => {
  it('drives to the spot, stops level and rests with its wheels well under their limit', async () => {
    const { robot, joints, idle, worstTilt } = await runFirstRobot();

    expect(robot.forward).toBeGreaterThan(0.7);
    expect(robot.speed).toBeLessThan(0.01);
    expect(robot.tilt).toBeLessThan(3);
    expect(worstTilt).toBeLessThan(5);
    expect(Math.max(...idle)).toBeLessThan(0.1);
    expect(Math.max(...joints.map((j) => j.peak))).toBeLessThan(0.6);
    expect(joints.every((j) => j.saturatedS === 0)).toBe(true);
  });
});
