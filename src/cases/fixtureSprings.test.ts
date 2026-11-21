import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { emitWorld } from '../sim/mjcfWorld';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { scaledToReach } from './scale';
import { parseCase, worldItem, type Case } from './schema';

function springCase(type: 'revolute' | 'prismatic'): Case {
  return parseCase({
    formatVersion: 1,
    id: 'spring',
    name: 'Spring',
    brief: '',
    slot: { needs: ['arm'], binding: {}, reachMm: 100, anchor: [0, 0, 0] },
    world: {
      objects: [
        {
          id: 'button',
          name: 'Button',
          kind: 'box',
          position: [0, 50, 0],
          rotation: [0, 0, 0],
          size: [10, 10, 10],
          color: '#909090',
          behavior: 'dynamic',
          massG: 10,
          joint: {
            type,
            axis: [1, 0, 0],
            origin: [0, 50, 0],
            range: [-20, 20],
            damping: 0.2,
            frictionloss: 0,
            stiffness: 2,
            springref: 5,
          },
        },
      ],
    },
    controls: [],
    reference: { timeline: [] },
    task: {
      seconds: 1,
      probes: [],
      contract: {
        version: 1,
        success: {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'button-travel' }, cmp: '>', value: 1, scale: 20 } },
          },
        },
        failures: [],
      },
    },
  });
}

it.each(['revolute', 'prismatic'] as const)(
  'preserves %s springs in portable scenes and reach scaling',
  async (type) => {
    const kase = springCase(type);
    const scene = sharedScene({
      name: 'Spring',
      globalGoal: '',
      parts: [],
      project: { ...DEFAULT_PROJECT, cases: [kase] },
    });
    const restored = await decodeSceneFile(await encodeSceneFile(scene));

    expect(parseCase(restored.project!.cases![0])).toEqual(kase);
    expect(kase.world.objects[0].joint).toMatchObject({ stiffness: 2, springref: 5 });
    expect(scaledToReach(kase, 50, [0, 0, 0]).world.objects[0].joint).toMatchObject({
      stiffness: 2,
      springref: type === 'prismatic' ? 2.5 : 5,
    });
  },
);

it.each(['revolute', 'prismatic'] as const)(
  'emits %s return force in MuJoCo without a fixture actuator',
  async (type) => {
    const mj = await loadMujoco();
    const kase = springCase(type);
    const emitted = emitWorld(
      {
        parts: [],
        rig: buildRig([], []),
        project: DEFAULT_PROJECT,
        measures: {},
        partTriangles: () => null,
        world: kase.world.objects.map(worldItem),
      },
      0,
    );
    const xml = `<mujoco><compiler angle="radian"/><option gravity="0 0 0"/><worldbody>${emitted.lines.join('\n')}</worldbody></mujoco>`;
    const model = mj.MjModel.from_xml_string(xml);
    const data = new mj.MjData(model);
    const unit = type === 'revolute' ? Math.PI / 180 : 0.001;

    try {
      data.qpos[0] = 10 * unit;
      mj.mj_forward(model, data);
      expect(model.nu).toBe(0);
      expect(data.qfrc_passive[0]).toBeCloseTo(-2 * 5 * unit, 8);

      for (let step = 0; step < 2000; step++) mj.mj_step(model, data);

      expect(data.qpos[0] / unit).toBeCloseTo(5, 1);
    } finally {
      data.delete();
      model.delete();
    }
  },
);

it('refuses unsafe springs before parsing or simulation and preserves legacy joints', () => {
  const kase = springCase('prismatic');
  const source = kase.world.objects[0].joint!;

  for (const change of [{ stiffness: -1 }, { stiffness: Infinity }, { springref: NaN }, { springref: 21 }]) {
    const broken = structuredClone(kase);

    broken.world.objects[0].joint = { ...source, ...change };
    expect(() => parseCase(broken)).toThrow();
    expect(() =>
      emitWorld(
        {
          parts: [],
          rig: buildRig([], []),
          project: DEFAULT_PROJECT,
          measures: {},
          partTriangles: () => null,
          world: broken.world.objects.map(worldItem),
        },
        0,
      ),
    ).toThrow();
  }

  const legacy = structuredClone(kase);

  delete legacy.world.objects[0].joint!.stiffness;
  delete legacy.world.objects[0].joint!.springref;
  expect(parseCase(legacy)).toEqual(legacy);
});
