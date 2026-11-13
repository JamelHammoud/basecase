import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { driveAccess } from '../sim/driveAccess';
import { sameCommand } from '../sim/driveKeys';
import type { DriveCommand } from '../sim/driveTypes';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { livePlayer } from './referencePlayer';
import { robotFacts } from './robotFit';
import { scaledToReach } from './scale';
import { worldItem } from './schema';
import { caseTemplates } from './templates';
import { caseRobot } from './testing';

const FRAME_S = 1 / 60;

describe('the live reference', () => {
  it('drives the rover onto its flag from screen frames, sending only changed commands', async () => {
    const mj = await loadMujoco();
    const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
    const rig = buildRig(rover.joints, rover.parts);
    const facts = robotFacts(rig, rover.parts);
    const authored = caseTemplates(rig, rover.parts)
      .find((t) => t.id === 'reach-the-flag')!
      .build();
    const kase = scaledToReach(authored, facts.reachMm, facts.anchor);
    const model = buildMjcf({
      ...caseRobot(rover),
      rig,
      project: DEFAULT_PROJECT,
      world: kase.world.objects.map(worldItem),
    });
    const access = driveAccess({ rig, parts: rover.parts, model });

    if (access.kind !== 'ready') throw new Error(`No scripted drive: ${access.kind}`);

    const engine = new SimEngine(mj, model);
    let command: DriveCommand = { v: [0, 0, 0] };
    let sent = command;
    let sends = 0;
    const player = livePlayer({ kase, rig, parts: rover.parts, model, send: (next) => (command = next) });

    engine.setController({ kind: 'drive', setup: access.setup });

    for (let t = 0; t < kase.task.seconds; t += FRAME_S) {
      player.tick(t, engine.poses());

      if (!sameCommand(command, sent)) {
        sent = command;
        sends++;
        engine.command(command);
      }

      engine.step(FRAME_S);
    }

    const [base] = engine.stats().robots;
    const flag = kase.world.objects[0].position;

    expect(base.forward * 1000).toBeGreaterThan(flag[2] - 160);
    expect(base.forward * 1000).toBeLessThan(flag[2] + 160);
    expect(base.speed).toBeLessThan(0.05);
    expect(sends).toBeLessThan(kase.task.seconds / FRAME_S);
    engine.dispose();
  });
});
