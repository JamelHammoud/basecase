import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { SimEngine } from './engine';
import { contactSliders } from './fixtures/contactRobots';
import { box } from './fixtures/parts';
import { integrationState } from './integrationState';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function modelFor() {
  const model = contactSliders(1, [{ ...box('stop', [39.8, 20, 0], [40, 40, 40], 100), behavior: 'static' }]);

  return { ...model, xml: model.xml.replace('<position ', '<position delay="0.006" nsample="16" ') };
}

function poseDrive(engine: SimEngine) {
  engine.setController({
    kind: 'drive',
    setup: {
      kind: 'pose',
      robot: engine.sim.robots[0].key,
      joints: [{ id: 'slider0', range: [-90, 90] }],
      start: {},
      rate: 240,
    },
  });
  engine.command({ v: [0, 0, 0], joints: { slider0: 3 } });
}

describe('engine continuation', () => {
  it.each(['laggy', 'weak', 'stuck', 'limp'] as const)(
    'continues complete engine state with a spanning %s fault',
    (kind) => {
      const model = modelFor();
      const original = new SimEngine(mj, model);
      const restored = new SimEngine(mj, model);

      try {
        poseDrive(original);
        original.data.qfrc_applied[0] = 0.5;
        original.model.body_mass[1] *= 1.3;
        original.model.dof_damping[0] *= 1.2;
        mj.mj_setConst(original.model, original.data);
        original.setFault('slider0', kind);
        original.step(0.08);

        const state = original.continuation.capture();

        expect(state).not.toBeNull();
        expect(original.data.ncon).toBeGreaterThan(0);
        expect(state && restored.continuation.restore(state)).toBe(true);
        expect(restored.stats()).toEqual(original.stats());
        expect(restored.model.body_mass).toEqual(original.model.body_mass);
        expect(restored.model.dof_damping).toEqual(original.model.dof_damping);

        for (let tick = 0; tick < 100; tick++) {
          const command = { v: [0, 0, 0] as [number, number, number], joints: { slider0: 2 + Math.sin(tick / 5) } };

          original.command(command);
          restored.command(command);

          if (tick === 30) {
            original.setFault('slider0', null);
            restored.setFault('slider0', null);
          }

          original.step(original.dt);
          restored.step(restored.dt);
          expect(integrationState(mj, restored.model, restored.data)).toEqual(
            integrationState(mj, original.model, original.data),
          );
          expect(restored.stats()).toEqual(original.stats());
          expect(restored.contactPairs()).toEqual(original.contactPairs());
        }
      } finally {
        original.dispose();
        restored.dispose();
      }
    },
  );

  it('refuses edited sources and runtime versions even when dimensions match', () => {
    const model = modelFor();
    const original = new SimEngine(mj, model);
    const edited = new SimEngine(mj, { ...model, xml: model.xml.replace('kp="200"', 'kp="201"') });

    try {
      const state = original.continuation.capture()!;
      const before = integrationState(mj, edited.model, edited.data);

      expect(edited.continuation.restore(state)).toBe(false);
      expect(integrationState(mj, edited.model, edited.data)).toEqual(before);
      expect(original.continuation.restore({ ...state, mujoco: -1 })).toBe(false);
      expect(original.continuation.restore({ ...state, modelVersion: -1 })).toBe(false);
    } finally {
      original.dispose();
      edited.dispose();
    }
  });

  it('refuses malformed realized arrays before modifying the destination', () => {
    const engine = new SimEngine(mj, modelFor());

    try {
      const state = engine.continuation.capture()!;
      const before = integrationState(mj, engine.model, engine.data);
      const negativeMass = structuredClone(state);
      const fractionalMask = structuredClone(state);

      negativeMass.realized.body_mass[1] = -1;
      fractionalMask.realized.geom_contype[1] = 0.5;

      for (const malformed of [negativeMass, fractionalMask]) {
        expect(engine.continuation.restore(malformed)).toBe(false);
        expect(integrationState(mj, engine.model, engine.data)).toEqual(before);
      }
    } finally {
      engine.dispose();
    }
  });

  it('refuses uncaptured force state and unsupported controllers', () => {
    const engine = new SimEngine(mj, modelFor());

    try {
      engine.pushRobot(engine.sim.robots[0].key, [1, 0, 0]);
      expect(engine.continuation.capture()).toBeNull();
      engine.reset();
      engine.setController({
        kind: 'animation',
        animation: { id: 'motion', name: 'Motion', duration: 1, loop: false, keyframes: [], interpolation: 'linear' },
      });
      expect(engine.continuation.capture()).toBeNull();
    } finally {
      engine.dispose();
    }
  });
});
