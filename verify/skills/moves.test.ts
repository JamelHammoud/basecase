import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { environmentHash } from '../../src/skills/environment';
import { caseModel, moveCases, type MoveCase } from '../../src/skills/moveCases';
import { MOVE_BARS, moveEnvironment } from '../../src/skills/moveEnvironment';
import { finalJoints, rejudge, trainCase } from './moves';

const TRAIN_TIMEOUT = 45 * 60_000;
const EVERY_VARIANT = 29;
const cases = moveCases();
const byId = (id: string) => cases.find((c) => c.id === id)!;

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

async function trainedSkill(c: MoveCase) {
  const trained = await trainCase(mj, c);
  const { outcome } = trained;

  if (outcome.kind !== 'skill') throw new Error(`${c.id}: ${outcome.reason}`);

  expect(outcome.skill.evidence?.passed).toBe(true);
  expect(environmentHash(trained.environment)).toBe(environmentHash(moveEnvironment(trained.model, c.animation)));
  expect(trained.store.saved.size).toBeGreaterThan(0);

  const evidence = await rejudge({ mj, c, controller: outcome.skill.controller });

  expect(evidence.passed, `${c.id}: ${evidence.summary}`).toBe(true);

  return { ...trained, outcome, evidence };
}

describe('Pose-tab animations trained as moves', () => {
  it(
    'biped-servo learns the retargeted squat that playback alone drops',
    async () => {
      const c = byId('biped-squat-mocap');
      const { outcome, evidence, forge } = await trainedSkill(c);
      const played = await rejudge({ mj, c, controller: { kind: 'animation', animation: c.animation } });

      expect(outcome.method).toBe('tracking');
      expect(forge.records.length).toBeGreaterThan(0);

      for (const v of evidence.variants) expect(v.passes, v.variant).toBeGreaterThanOrEqual(EVERY_VARIANT);

      expect(evidence.variants).toHaveLength(3);
      expect(played.passed, played.summary).toBe(false);
    },
    TRAIN_TIMEOUT,
  );

  it(
    'quad-servo sits and ends on its last key',
    async () => {
      const c = byId('quad-sit');
      const { outcome, model, environment } = await trainedSkill(c);
      const last = environment.reference!.frames.at(-1)!;
      const ended = finalJoints({ mj, model, environment, controller: outcome.skill.controller });

      expect(outcome.method).toBe('tracking');
      ended.forEach((q, j) => expect(Math.abs(q - last[j])).toBeLessThan(MOVE_BARS.toleranceRad));
    },
    TRAIN_TIMEOUT,
  );

  for (const id of ['quad-shake', 'hexapod-dance', 'humanoid-wave'])
    it(
      `${id} is learned through Forge and passes a fresh Arena`,
      async () => {
        const { outcome, forge } = await trainedSkill(byId(id));

        expect(outcome.method).toBe('tracking');
        expect(forge.records.length).toBeGreaterThan(0);
      },
      TRAIN_TIMEOUT,
    );

  it(
    'biped-servo learns the hand-keyed bow on the same tracking path',
    async () => {
      const { outcome, forge } = await trainedSkill(byId('biped-bow'));

      expect(outcome.method).toBe('tracking');
      expect(forge.records.length).toBeGreaterThan(0);
    },
    TRAIN_TIMEOUT,
  );

  it(
    'arm-3dof plays its wave without training',
    async () => {
      const c = byId('arm-wave');
      const { outcome, forge } = await trainedSkill(c);

      expect(caseModel(c).robots[0].floating).toBe(false);
      expect(outcome.method).toBe('ik-or-motion-plan');
      expect(outcome.cost.steps).toBe(0);
      expect(forge.records).toHaveLength(0);
      expect(outcome.skill.controller.kind).toBe('animation');
    },
    10 * 60_000,
  );
});
