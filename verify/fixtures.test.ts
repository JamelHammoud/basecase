import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureMeasures, fixtureTriangles } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { buildMjcf } from '../src/sim/mjcf';
import { trainingJob } from '../src/sim/trainingJob';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';

const OUT = path.resolve('verify/out/fixtures');

function emit(robot: ReturnType<typeof fixtureRobots>[number]) {
  const rig = buildRig(robot.joints, robot.parts);
  const model = buildMjcf({
    parts: robot.parts,
    rig,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
  });
  const dir = path.join(OUT, robot.id);
  const key = model.robots[0].key;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'model.xml'), model.xml);
  fs.writeFileSync(path.join(dir, 'sim.json'), JSON.stringify(model));
  fs.writeFileSync(
    path.join(dir, 'job.json'),
    JSON.stringify(trainingJob(model, key, { task: 'walk', minutes: 1, command: [0.25, 0, 0] }, robot.id)),
  );

  return model;
}

describe('fixture robots', () => {
  for (const robot of fixtureRobots()) {
    it(`${robot.id} classifies and emits`, () => {
      const model = emit(robot);

      expect(model.robots).toHaveLength(1);
      expect(model.robots[0].morphology).toBe(robot.expect.morphology);
      expect(model.joints).toHaveLength(robot.joints.length);
    });
  }
});
