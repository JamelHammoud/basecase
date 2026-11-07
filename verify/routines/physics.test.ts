import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { compileRoutine, greetingRoutine } from '../../src/routines/testing';
import type { Plan } from '../../src/routines/planTypes';
import type { Scenario } from '../../src/routines/scenarioTypes';
import { need } from '../lib/need';
import { ACCEPTANCE, acceptanceProblems } from './acceptance';
import { greeter, greeterWithoutHead } from './greeter';
import {
  CAPABILITIES_MODULE,
  type CapabilitiesModule,
  PHYSICS_MODULE,
  type PhysicsModule,
  type PhysicsRobot,
  type PhysicsSample,
  type PhysicsScenarioResult,
} from './interfaces';
import { controlSpans, displacement, yawTurned } from './physicsMath';

const KIT_SKILLS = ['walk', 'settle', 'turn-away', 'look-at'];
const MIN_WALK_TRAVEL_M = 0.08;
const MIN_TURN_RAD = 0.3;
const MAX_STILL_M = 0.02;
const MIN_SAMPLE_HZ = 10;
const OBSTACLE_AT = 6;

const physics = () => need<PhysicsModule>(PHYSICS_MODULE, ['routineKit', 'runPhysicsScenario']);
const capabilities = () => need<CapabilitiesModule>(CAPABILITIES_MODULE, ['sceneCapabilities']);

async function setup(robot: PhysicsRobot) {
  const [{ routineKit, runPhysicsScenario }, { sceneCapabilities }, mj] = await Promise.all([
    physics(),
    capabilities(),
    loadMujoco(),
  ]);
  const kit = await routineKit(mj, robot);
  const compiled = compileRoutine(greetingRoutine(), {
    skills: kit.skills,
    modelHash: kit.modelHash,
    capabilities: sceneCapabilities(robot),
  });
  const run = (plan: Plan, scenario: Scenario) => runPhysicsScenario(plan, scenario, { mj, robot, kit });

  return { kit, compiled, run };
}

function sampledWell(samples: PhysicsSample[], seconds: number): boolean {
  const gaps = samples.slice(1).map((s, i) => s.t - samples[i].t);

  return samples.length >= seconds * MIN_SAMPLE_HZ && Math.max(...gaps) <= 1 / MIN_SAMPLE_HZ + 1e-6;
}

const obstacleScenario: Scenario = {
  covers: 'something blocks the way',
  world: [
    { at: OBSTACLE_AT, fact: 'obstacle', value: true },
    { at: OBSTACLE_AT + 1, fact: 'obstacle', value: false },
  ],
  mocks: {},
  faults: [],
  seconds: 20,
  expect: [],
};

function obstacleProblems(r: PhysicsScenarioResult): string[] {
  const spans = controlSpans(r.trace, obstacleScenario.seconds);
  const turn = spans.find((s) => s.skill === 'turn-away' && s.from >= OBSTACLE_AT);
  const settle = spans.find((s) => s.skill === 'settle' && s.from >= OBSTACLE_AT && s.until - s.from >= 0.5);
  const walkAgain = spans.find((s) => s.skill === 'walk' && turn && s.from >= turn.until);
  const problems: string[] = [];

  if (!r.said.includes('Excuse me')) problems.push(`It never said "Excuse me": ${JSON.stringify(r.said)}`);

  if (!turn) return [...problems, `It never turned away: ${JSON.stringify(spans)}`];

  const turned = yawTurned(r.physics.samples, turn.from, turn.until);

  if (turned < MIN_TURN_RAD) problems.push(`Turn Away turned the body ${turned.toFixed(2)} rad`);

  if (!settle) problems.push('It never stood still for 0.5 s before turning');
  else if (displacement(r.physics.samples, settle.until - 0.5, settle.until) > MAX_STILL_M) {
    problems.push('The body kept moving while it settled');
  }

  if (!walkAgain) problems.push('It never walked again after turning away');

  return problems;
}

describe('L1: the coordinator runs against MuJoCo with Kit skills', () => {
  it('builds a Kit with proven transitions for the greeter, and the greeting compiles against it', async () => {
    const { kit, compiled } = await setup(greeter());

    for (const id of KIT_SKILLS) expect(kit.skills.find((s) => s.id === id)?.status, id).toBe('ready');

    const proofs = kit.skills.flatMap((s) => Object.values(s.transitions));

    expect(proofs.length).toBeGreaterThanOrEqual(KIT_SKILLS.length);

    for (const p of proofs) expect(p.modelHash).toBe(kit.modelHash);

    expect(compiled.errors ?? []).toEqual([]);
  });

  it('passes the acceptance scenarios in physics: it walks, greets and never falls', async () => {
    const { compiled, run } = await setup(greeter());

    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

    for (const a of ACCEPTANCE.slice(0, 3)) {
      const r = await run(compiled.plan, a.scenario);
      const walked = displacement(r.physics.samples, 0.5, 6);

      expect(acceptanceProblems(a, r)).toEqual([]);
      expect(r.physics.fellAt, a.scenario.covers).toBeNull();
      expect(sampledWell(r.physics.samples, a.scenario.seconds), a.scenario.covers).toBe(true);
      expect(walked, `${a.scenario.covers}: walked ${walked.toFixed(3)} m`).toBeGreaterThanOrEqual(MIN_WALK_TRAVEL_M);
    }
  });

  it('stops first, turns away in physics and walks on when something blocks the way', async () => {
    const { compiled, run } = await setup(greeter());

    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

    const r = await run(compiled.plan, obstacleScenario);

    expect(r.physics.fellAt).toBeNull();
    expect(obstacleProblems(r)).toEqual([]);
  });

  it('runs the same scenario twice to the same trace and the same motion', async () => {
    const { compiled, run } = await setup(greeter());

    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

    const a = await run(compiled.plan, ACCEPTANCE[0].scenario);
    const b = await run(compiled.plan, ACCEPTANCE[0].scenario);

    expect(JSON.stringify(b.trace)).toBe(JSON.stringify(a.trace));
    expect(JSON.stringify(b.physics.samples)).toBe(JSON.stringify(a.physics.samples));
  });

  it('marks a skill the Kit cannot run as Needs Training, and the compiler refuses the Routine', async () => {
    const { kit, compiled } = await setup(greeterWithoutHead());

    expect(kit.skills.find((s) => s.id === 'look-at')?.status).toBe('needsTraining');
    expect(kit.skills.find((s) => s.id === 'walk')?.status).toBe('ready');
    expect(compiled.ok).toBe(false);
    expect(compiled.errors?.some((e) => e.code === 'needs-training' && e.path === 'lookAt')).toBe(true);
  });
});
