import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobot } from '../skills/fixtureModels';
import { sceneCapabilities } from './capabilities';
import { compileRoutine } from './compile';
import { applyEdits, newRoutine, type RoutineEdit, type StepAt } from './edit';
import { routineKit, runPhysicsScenario } from './physics';
import { moverFor } from './routineNeeds';
import type { Scenario } from './scenarioTypes';
import type { Routine, SkillContract } from './schema';
import { skillChoice, stepChoices } from './stepMenu';

const MAIN = { parent: 'start', key: 'onTimeout' } as const;
const at = (index: number): StepAt => ({ seq: MAIN, index });
const RUN: Scenario = { covers: 'drive, jump, stop', world: [], mocks: {}, faults: [], seconds: 20, expect: [] };

const JUMP_PROOF = { seeds: 8, falls: 0 };
const ONE_METRE = 1;
const REACH_TOLERANCE_M = 0.1;

function withJump(skills: SkillContract[], modelHash: string): SkillContract[] {
  const proof = { ...JUMP_PROOF, modelHash };
  const jump: SkillContract = {
    id: 'jump',
    status: 'ready',
    rateHz: 50,
    holds: ['body'],
    startsFrom: ['standing'],
    endsIn: 'standing',
    interrupt: 'any',
    stopVia: 'settle',
    transitions: { settle: proof },
  };

  return [...skills.map((s) => (s.id === 'walk' ? { ...s, transitions: { ...s.transitions, jump: proof } } : s)), jump];
}

function handBuild(skills: SkillContract[], mover: Routine['requires'][number]): Routine {
  let routine = newRoutine({ id: 'hand', name: 'Drive and Jump', mover });
  const add = (key: string, index: number) => {
    const choice = stepChoices({ routine, at: at(index), skills }).find((c) => c.key === key) ?? skillChoice(key);

    routine = applyEdits(routine, choice.make(routine, at(index)));
  };

  add('drive', 0);
  routine = applyEdits(routine, [
    {
      op: 'update',
      id: 'drive',
      patch: { move: { distance: ONE_METRE, speed: 0.2, heading: 0 } },
    } satisfies RoutineEdit,
  ]);
  add('skill:jump', 1);
  add('stop', 2);

  return routine;
}

const flat = (base: [number, number, number], from: [number, number, number]) =>
  Math.hypot(base[0] - from[0], base[1] - from[1]);

describe('a Routine built by hand', () => {
  it('drives 1 m forward, jumps and stops in physics', async () => {
    const mj = await loadMujoco();
    const fixture = fixtureRobot('rover-diff');
    const robot = { id: fixture.id, parts: fixture.parts, joints: fixture.joints };
    const kit = await routineKit(mj, robot, { skills: [] });
    const skills = withJump(kit.skills, kit.modelHash);
    const capabilities = sceneCapabilities(robot);
    const routine = handBuild(skills, moverFor(capabilities));
    const compiled = compileRoutine(routine, { skills, modelHash: kit.modelHash, capabilities });

    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

    expect(compiled.plan.ops.map((o) => o.node)).toEqual(['drive', 'jump', 'stop']);

    const result = await runPhysicsScenario(compiled.plan, RUN, { mj, robot, kit });
    const done = result.trace.filter((e) => e.kind === 'opDone').map((e) => e.node);
    const samples = result.physics.samples;
    const start = samples[0].base;
    const end = samples.at(-1)?.base ?? start;
    const driveEnd = result.trace.find((e) => e.kind === 'opDone' && e.node === 'drive')?.t ?? 0;
    const atDriveEnd = samples.find((s) => s.t * 1000 >= driveEnd)?.base ?? start;

    expect(done).toEqual(['drive', 'jump', 'stop']);
    expect(result.trace.some((e) => e.kind === 'safeStop')).toBe(true);
    expect(result.physics.fellAt).toBeNull();
    expect(flat(atDriveEnd, start)).toBeGreaterThanOrEqual(ONE_METRE);
    expect(flat(end, start)).toBeGreaterThanOrEqual(ONE_METRE - REACH_TOLERANCE_M);
    expect(flat(end, start)).toBeLessThanOrEqual(ONE_METRE + REACH_TOLERANCE_M);
  }, 60000);
});
