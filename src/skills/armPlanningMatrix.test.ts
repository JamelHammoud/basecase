import { box } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import { fromMj } from '../sim/mjcfFrames';
import { selfContactArm } from '../sim/fixtures/selfContactArm';
import { dividerInput, dividerModel } from './armMotionFixtures';
import { planArmMotion } from './armMotion';
import { checkArmMotion } from './armMotionTrial';
import { draftEnvironment } from './teachEnvironment';
import { ArmConfiguration } from './armConfiguration';
import { trainAnything } from './anything';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import { ARM_TASKS, armPlanningCase } from './armPlanningCases';
import { armReachRequest } from './armPlanningPipeline';
import { draftSkill, raceDraft } from './teach';
import { readSkillBundle } from './bundle';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function inspectContacts(engine: SimEngine) {
  const contacts = engine.data.contact;

  try {
    for (let i = 0; i < engine.data.ncon; i++) {
      const c = contacts.get(i)!;
      const distance = c.dist;

      c.delete();

      if (Number.isNaN(distance) || distance < -1e-8) throw new Error('Trajectory contact penetrates');
    }
  } finally {
    contacts.delete();
  }
}

function inspectLimits(model: SimModel, values: Record<string, number>) {
  for (const joint of model.joints) {
    const value = values[joint.id];

    const low = (joint.range?.[0] ?? -Infinity) - 1e-6;
    const high = (joint.range?.[1] ?? Infinity) + 1e-6;

    if (!Number.isFinite(value) || value < low || value > high)
      throw new Error('Trajectory joint exceeds its authored limits: ' + joint.id);
  }
}

function inspectAnimation(model: SimModel, animation: RobotAnimation) {
  const engine = new SimEngine(mj, model);
  const keys = animation.keyframes;

  try {
    expect(keys[0].t).toBe(0);

    for (let i = 1; i < keys.length; i++) {
      const from = keys[i - 1];
      const to = keys[i];

      expect(to.t).toBeGreaterThan(from.t);

      for (let k = 0; k <= 500; k++) {
        const values = Object.fromEntries(
          Object.keys(from.values).map((id) => [id, from.values[id] + ((to.values[id] - from.values[id]) * k) / 500]),
        );

        inspectLimits(model, values);

        engine.reset({ values });
        inspectContacts(engine);
      }
    }

    for (const key of keys) expect(key.values['park-joint'] ?? 0).toBe(model.initial.values['park-joint'] ?? 0);
  } finally {
    engine.dispose();
  }
}

const solid = (id: string, at: [number, number, number], size: [number, number, number]) => ({
  ...box(id, at, size, 1000),
  behavior: 'static' as const,
});

function toolCenter(model: SimModel, values = model.initial.values) {
  const engine = new SimEngine(mj, model);

  try {
    engine.reset({ values });

    const geom = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_GEOM.value, 'g_link2');
    const at = engine.data.geom_xpos;

    return fromMj(at[geom * 3], at[geom * 3 + 1], at[geom * 3 + 2]);
  } finally {
    engine.dispose();
  }
}

function negativeModel(kind: 'enclosed' | 'start' | 'clearance' | 'limits') {
  const input = dividerInput();
  const original = dividerModel();

  if (kind === 'limits') {
    input.project.joints[1] = { ...input.project.joints[1], range: [-0.001, 0.001] };
    input.rig.joints[1] = input.project.joints[1];

    return buildMjcf(input);
  }

  if (kind === 'start') input.world.push(solid('start-block', toolCenter(original), [40, 40, 40]));

  if (kind === 'clearance') input.world.push(solid('near-wall', [22.5, 180, 0], [20, 240, 500]));

  if (kind === 'enclosed') {
    const at = toolCenter(original, { arm0: 60, arm1: 0, arm2: 0 });

    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        const point = [...at] as [number, number, number];
        const size: [number, number, number] = [80, 80, 80];

        point[axis] += sign * 40;
        size[axis] = 8;
        input.world.push(solid(`enclosure-${axis}-${sign}`, point, size));
      }
    }
  }

  return buildMjcf(input);
}

it.each(['enclosed', 'start', 'clearance', 'limits'] as const)(
  'retains no skill for the independent %s control',
  async (kind) => {
    const model = negativeModel(kind);
    const request = armReachRequest(mj, model, { arm0: 60, arm1: 0, arm2: 0 });
    const draft = await draftSkill({ mj, model, design: kind, request });

    expect(draft.ok).toBe(true);

    if (!draft.ok) throw new Error(draft.problems.join(' '));

    const saved: string[] = [];
    const outcome = await raceDraft({
      mj,
      model,
      draft: draft.report.draft,
      forge: async () => {
        throw new Error('Refused arm reaches must not train');
      },
      save: async (_path, text) => {
        saved.push(text);
      },
    });

    expect(outcome.kind).toBe('not-found');
    expect(saved).toEqual([]);

    if (outcome.kind !== 'skill') expect(outcome.reason).not.toMatch(/impossible|cannot reach/i);
  },
);

it('refuses forbidden self-contact through the prompt motion solver', async () => {
  const model = selfContactArm(true);
  const space = new ArmConfiguration(mj, model, ['tip']);

  expect(space.clear([0, (-85 * Math.PI) / 180])).toBe(false);
  space.dispose();

  const saved: string[] = [];
  const outcome = await trainAnything(
    {
      mj,
      model,
      design: 'fold',
      prompt: 'Fold the elbow to -85 degrees',
      signal: new AbortController().signal,
      budget: { steps: 0, wallS: 20 },
      method: 'ik-or-motion-plan',
      approve: async () => ({ approved: true }),
      forge: async () => {
        throw new Error('Arm fold must not train');
      },
      save: async (_path, text) => {
        saved.push(text);
      },
    },
    async () =>
      JSON.stringify({
        kind: 'task',
        name: 'Fold',
        seconds: 4,
        startOffsetDeg: 0,
        restIsGoal: false,
        success: {
          hold_for: { seconds: 0.5, within: { last: 1 }, state: { within: { sig: 'q:elbow', center: -85, tol: 3 } } },
        },
        failures: [],
        intent: [{ t: 0 }, { t: 2, joints: { elbow: -85 } }, { t: 4, joints: { elbow: -85 } }],
      }),
  );

  expect(outcome.kind).not.toBe('skill');
  expect(saved).toEqual([]);
});

it('rejects inadequate actuator tracking despite a clear geometric candidate', async () => {
  const model = dividerModel();
  const plan = await planArmMotion(mj, model, {
    parts: ['link2'],
    keys: [{ t: 8, values: { arm0: 60, arm1: 0, arm2: 0 } }],
    horizonS: 10,
    stop: () => false,
  });

  expect(plan.controller).not.toBeNull();

  if (!plan.controller) throw new Error(plan.reason);

  const weak = { ...model, xml: model.xml.replace(/forcerange="[^"]*"/g, 'forcerange="-0.000001 0.000001"') };
  const environment = draftEnvironment(weak, armReachRequest(mj, weak, { arm0: 60, arm1: 0, arm2: 0 }));
  const checked = await checkArmMotion(mj, weak, {
    controller: plan.controller,
    environment,
    parts: ['link2'],
    stop: () => false,
  });

  expect(checked.controller).toBeNull();
  expect(checked.reason).toContain('0 of 8 checks');
});

it.each(ARM_TASKS)('%s reaches through the production draft, search, physical trials and Arena', async (task) => {
  const fixture = armPlanningCase(task);
  const request = armReachRequest(mj, fixture.model, fixture.target);
  const draft = await draftSkill({
    mj,
    model: fixture.model,
    design: task,
    request,
  });

  expect(draft.ok).toBe(true);

  if (!draft.ok) throw new Error(draft.problems.join(' '));

  const saved: string[] = [];
  const outcome = await raceDraft({
    mj,
    model: fixture.model,
    draft: draft.report.draft,
    seed: 1812,
    forge: async () => {
      throw new Error('Arm plans must not train');
    },
    save: async (_path, text) => {
      saved.push(text);
    },
  });

  expect(outcome.kind, outcome.kind === 'skill' ? '' : outcome.reason).toBe('skill');
  expect(saved).toHaveLength(1);

  const reopened = readSkillBundle(saved.map((text) => JSON.parse(text)))!;
  const controller = reopened[0].controller;

  expect(reopened[0].evidence?.passed).toBe(true);
  expect(controller.kind).toBe('animation');

  if (controller.kind === 'animation') {
    expect(controller.animation.duration).toBe(request.seconds);
    inspectAnimation(fixture.model, controller.animation);
  }
});

it.each([37, -71])('retains a reach with the entire fixture rotated %i degrees', async (yaw) => {
  const fixture = armPlanningCase('column', yaw);
  const request = armReachRequest(mj, fixture.model, fixture.target);
  const draft = await draftSkill({ mj, model: fixture.model, design: 'rotated', request });

  expect(draft.ok).toBe(true);

  if (!draft.ok) throw new Error(draft.problems.join(' '));

  const outcome = await raceDraft({
    mj,
    model: fixture.model,
    draft: draft.report.draft,
    forge: async () => {
      throw new Error('Arm must not train');
    },
    save: async () => {},
  });

  expect(outcome.kind, outcome.kind === 'skill' ? '' : outcome.reason).toBe('skill');
});

it('plans an obstructed part goal through the existing prompt motion solver and Arena', async () => {
  const model = dividerModel();
  const saved: string[] = [];
  const outcome = await trainAnything(
    {
      mj,
      model,
      design: 'prompt-arm',
      prompt: 'Reach around the divider',
      signal: new AbortController().signal,
      budget: { steps: 0, wallS: 20 },
      method: 'ik-or-motion-plan',
      approve: async () => ({ approved: true }),
      forge: async () => {
        throw new Error('Arm must not train');
      },
      save: async (_path, text) => {
        saved.push(text);
      },
    },
    async () =>
      JSON.stringify({
        kind: 'task',
        name: 'Reach',
        seconds: 10,
        startOffsetDeg: 0,
        restIsGoal: false,
        success: {
          hold_for: {
            seconds: 0.5,
            within: { last: 2 },
            state: { near: { part: 'link2', right: 0, forward: 121.24, up: 70, tol: 5 } },
          },
        },
        failures: [],
        intent: [
          { t: 0 },
          { t: 8, parts: { link2: { right: 0, forward: 121.24, up: 70 } } },
          { t: 10, parts: { link2: { right: 0, forward: 121.24, up: 70 } } },
        ],
      }),
  );

  expect(outcome.kind, outcome.kind === 'skill' ? '' : outcome.reason).toBe('skill');
  expect(saved).toHaveLength(1);
});
