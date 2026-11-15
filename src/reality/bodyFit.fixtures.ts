import type { MainModule } from '@mujoco/mujoco';
import type { RobotRun } from '../robot/runBuffer';
import { SimEngine } from '../sim/engine';
import { box, joint, type P3 } from '../sim/fixtures/parts';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import type { SimModel } from '../sim/mjcfTypes';

export function bodyFixture() {
  const parts = [
    box('base', [0, 25, 0], [80, 50, 80], 400),
    box('forearm', [0, 100, 0], [24, 100, 30], 180),
    box('wrist', [0, 185, 0], [30, 70, 24], 90),
  ];
  const joints = [
    joint({ id: 'shoulder', link: ['base', 'forearm'], origin: [0, 50, 0], axis: [1, 0, 0], effortNm: 2 }),
    joint({
      id: 'wrist',
      link: ['forearm', 'wrist'],
      origin: [0, 150, 0],
      axis: [1, 0, 0],
      effortNm: 0.8,
      parentJoint: 'shoulder',
    }),
  ];
  const { model } = fixturePackageJob({ id: 'body-arm', parts, joints }).job;

  return {
    model,
    robot: model.robots[0].key,
    forearm: model.bodies.find((b) => b.joint === 'shoulder')!.name,
    wrist: model.bodies.find((b) => b.joint === 'wrist')!.name,
  };
}

export function slidingBodyFixture() {
  const feet: P3[] = [
    [-70, 50, -60],
    [70, 50, -60],
    [0, 50, 80],
  ];
  const parts = [
    box('body', [0, 125, 0], [160, 50, 200], 700),
    ...feet.map((at, i) => box(`leg${i}`, at, [20, 100, 20], 100)),
  ];
  const joints = feet.map((at, i) =>
    joint({
      id: `leg${i}`,
      link: ['body', `leg${i}`],
      origin: [at[0], 100, at[2]],
      axis: [1, 0, 0],
      effortNm: 5,
      type: 'prismatic',
      range: [-50, 50],
      limb: 'leg',
    }),
  );
  const { model } = fixturePackageJob({ id: 'sliding-feet', parts, joints }).job;

  return { model, robot: model.robots[0].key };
}

const slidingGoal = (t: number, index: number) =>
  index === 2 ? 0.02 * Math.sin(t * 4.7) : (index * 2 - 1) * 0.035 * Math.sin(t * 3.7);

export function loadedSlidingContact(mj: MainModule, engine: SimEngine): boolean {
  const force = new mj.DoubleBuffer(6);

  try {
    for (let i = 0; i < engine.data.ncon; i++) {
      const contact = engine.data.contact.get(i)!;
      const body = Math.max(engine.model.geom_bodyid[contact.geom1], engine.model.geom_bodyid[contact.geom2]);
      const speed = Math.hypot(engine.data.cvel[body * 6 + 3], engine.data.cvel[body * 6 + 4]);

      mj.mj_contactForce(engine.model, engine.data, i, force);

      const normal = (force.GetView() as Float64Array)[0];

      if (normal > 0.1 && speed > 0.01) return true;
    }

    return false;
  } finally {
    force.delete();
  }
}

export function recordedBodyRun(
  mj: MainModule,
  model: SimModel,
  sliding = false,
  observe?: (engine: SimEngine) => void,
): RobotRun {
  const engine = new SimEngine(mj, model);
  const run: RobotRun = {
    joints: model.joints.map((j) => j.id),
    intents: [],
    statuses: [],
    faultJoint: null,
    faultAt: 0,
    message: '',
  };

  try {
    for (let n = 0; n <= (sliding ? 40 : 60); n++) {
      const t = n * 0.06;
      const goals = model.joints.map((_, i) =>
        sliding ? slidingGoal(t, i) : 0.65 * Math.sin(t * (2.3 + i * 0.9)) + 0.18 * Math.sin(t * 7.3 + i),
      );

      run.statuses.push({ at: t * 1000, positions: Array.from(engine.jointAngles()) });
      run.intents.push({ at: t * 1000, joints: goals });
      engine.setController({
        kind: 'hold',
        values: Object.fromEntries(
          model.joints.map((j, i) => [j.id, goals[i] * (j.type === 'revolute' ? 180 / Math.PI : 1000)]),
        ),
      });
      engine.step(0.06);
      observe?.(engine);
    }

    return run;
  } finally {
    engine.dispose();
  }
}
