import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { contractHash, skillHash, type Skill } from '../skills/artifacts';
import type { ForgeJob, ForgeRunner } from '../skills/forgeRunner';
import { fixtureRobot, modelOf } from '../skills/fixtureModels';
import { moveEnvironment } from '../skills/moveEnvironment';
import { clockPolicy, clockSkill, fixtureMoveSkill, quadFlop, quadSit, quadWave } from '../skills/moveFixtures';
import { hexapodDance } from '../skills/moveCases';
import type { SimModel } from '../sim/mjcfTypes';
import { sceneCapabilities } from './capabilities';
import { compileRoutine } from './compile';
import { applyEdits, newRoutine, type StepAt } from './edit';
import { withHandoffs, type HandoffProofs } from './handoffs';
import { trainHandoff } from './handoffTraining';
import { loadKitLibrary } from './kitLibrary';
import { KIT_SKILL_NAMES } from './physicsBody';
import { scriptedDrive } from './physicsDrive';
import { handoffStates, kitForModel, proveHandoff, type KitScene, type RoutineKit } from './physicsKit';
import type { Routine } from './schema';
import { pairStamp } from './skillStamps';
import { skillChoice, stepChoices } from './stepMenu';

const MAIN = { parent: 'start', key: 'onTimeout' } as const;
const at = (index: number): StepAt => ({ seq: MAIN, index });

let mj: MainModule;
let library: Skill[];

beforeAll(async () => {
  [mj, library] = await Promise.all([loadMujoco(), loadKitLibrary()]);
});

const quadRobot = fixtureRobot('quad-servo');
const quad = modelOf(quadRobot);

function sceneOf(robotId: string, model: SimModel, own: Skill[]): KitScene {
  const robot = fixtureRobot(robotId);

  return {
    mj,
    model,
    joints: robot.joints,
    skills: [...library, ...own],
    drive: scriptedDrive(model, robot.joints, robot.parts),
  };
}

function thenSkill(skill: string, kit: RoutineKit): Routine {
  let routine = newRoutine({ id: 'handoff', name: 'Hand-off', mover: 'legs' });
  const add = (key: string, index: number) => {
    const choice = stepChoices({ routine, at: at(index), skills: kit.skills }).find((c) => c.key === key);

    routine = applyEdits(routine, (choice ?? skillChoice(key)).make(routine, at(index)));
  };

  add('drive', 0);
  add(`skill:${skill}`, 1);

  return routine;
}

function compileWith(routine: Routine, kit: RoutineKit, proofs?: HandoffProofs, modelHash = kit.modelHash) {
  return compileRoutine(routine, {
    skills: withHandoffs(kit, proofs),
    modelHash,
    capabilities: sceneCapabilities(quadRobot),
  });
}

const refusals = (result: ReturnType<typeof compileWith>) =>
  result.ok ? [] : result.errors.filter((e) => e.code === 'unproven-transition').map((e) => e.handoff);

describe('proving any hand-off', { timeout: 120_000 }, () => {
  it('refuses walk then a Wave move until Prove runs, then compiles', () => {
    const scene = sceneOf('quad-servo', quad, [fixtureMoveSkill({ model: quad, animation: quadWave() })]);
    const kit = kitForModel(scene);
    const routine = thenSkill('wave', kit);

    expect(refusals(compileWith(routine, kit))).toEqual([{ from: 'walk', to: 'wave', falls: null }]);

    const proof = proveHandoff(scene, { from: 'walk', to: 'wave' });

    expect(proof).toEqual({
      seeds: 8,
      falls: 0,
      modelHash: kit.modelHash,
      skills: pairStamp(scene, { from: 'walk', to: 'wave' }),
    });
    expect(compileWith(routine, kit, { 'walk->wave': proof! }).ok).toBe(true);
  });

  it('proves stand then a taught Sit on the quad', () => {
    const scene = sceneOf('quad-servo', quad, [clockSkill(quad, quadSit())]);

    expect(proveHandoff(scene, { from: 'settle', to: 'sit' })?.falls).toBe(0);
  });

  it('proves the hexapod’s walk then a dance move', () => {
    const hexapod = modelOf(fixtureRobot('hexapod'));
    const scene = sceneOf('hexapod', hexapod, [fixtureMoveSkill({ model: hexapod, animation: hexapodDance() })]);

    expect(proveHandoff(scene, { from: 'walk', to: 'dance-step' })?.falls).toBe(0);
  });

  it('keeps a limp target refused, with its fall count', () => {
    const scene = sceneOf('quad-servo', quad, [fixtureMoveSkill({ model: quad, animation: quadFlop() })]);
    const kit = kitForModel(scene);
    const proof = proveHandoff(scene, { from: 'walk', to: 'flop' })!;
    const result = compileWith(thenSkill('flop', kit), kit, { 'walk->flop': proof });

    expect(proof.falls).toBe(8);
    expect(refusals(result)).toEqual([{ from: 'walk', to: 'flop', falls: 8 }]);
    expect(result.ok ? '' : result.errors[0].message).toBe('walk to flop fell in 8 of 8 tries in simulation.');
  });

  it('gives the Kit’s own pairs the proofs the Kit records', () => {
    const scene = sceneOf('quad-servo', quad, []);
    const kit = kitForModel(scene);
    const kitProof = (from: string, to: string) => ({
      seeds: 8,
      falls: 0,
      modelHash: kit.modelHash,
      skills: pairStamp(scene, { from, to }),
    });

    for (const skill of kit.skills.filter((s) => s.status === 'ready')) {
      for (const [to, proof] of Object.entries(skill.transitions))
        expect(proveHandoff(scene, { from: skill.id, to })).toEqual(proof);
    }

    expect(kit.skills.map((s) => [s.id, s.transitions])).toEqual([
      ['walk', { settle: kitProof('walk', 'settle') }],
      ['settle', { walk: kitProof('settle', 'walk'), 'turn-away': kitProof('settle', 'turn-away') }],
      ['turn-away', { walk: kitProof('turn-away', 'walk'), settle: kitProof('turn-away', 'settle') }],
      ['look-at', {}],
    ]);
  });

  it('makes a proof stale when the robot’s model changes', () => {
    const scene = sceneOf('quad-servo', quad, [fixtureMoveSkill({ model: quad, animation: quadWave() })]);
    const kit = kitForModel(scene);
    const proof = proveHandoff(scene, { from: 'walk', to: 'wave' })!;
    const moved = kitForModel({ ...scene, model: modelOf(quadRobot, 0.001) });

    expect(moved.modelHash).not.toBe(kit.modelHash);
    expect(refusals(compileWith(thenSkill('wave', moved), moved, { 'walk->wave': proof }))).toEqual([
      { from: 'walk', to: 'wave', falls: null },
    ]);
  });

  it('makes a proof stale when either skill is retrained', () => {
    const wave = clockSkill(quad, quadWave());
    const scene = sceneOf('quad-servo', quad, [wave]);
    const proof = proveHandoff(scene, { from: 'walk', to: 'wave' })!;
    const retrained = (skill: Skill): Skill =>
      skill.controller.kind === 'policy'
        ? {
            ...skill,
            controller: {
              ...skill.controller,
              policy: { ...skill.controller.policy, trainedSteps: skill.controller.policy.trainedSteps + 1 },
            },
          }
        : skill;
    const newWave = kitForModel(sceneOf('quad-servo', quad, [retrained(wave)]));
    const newWalk = kitForModel({
      ...scene,
      skills: [...library.map((s) => (s.name === KIT_SKILL_NAMES.velocity ? retrained(s) : s)), wave],
    });

    const kit = kitForModel(scene);

    expect(compileWith(thenSkill('wave', kit), kit, { 'walk->wave': proof }).ok).toBe(true);

    for (const changed of [newWave, newWalk])
      expect(refusals(compileWith(thenSkill('wave', changed), changed, { 'walk->wave': proof }))).toEqual([
        { from: 'walk', to: 'wave', falls: null },
      ]);
  });

  it('gives the same proof and the same start states for the same seeds', () => {
    const scene = sceneOf('quad-servo', quad, [fixtureMoveSkill({ model: quad, animation: quadFlop() })]);

    expect(proveHandoff(scene, { from: 'walk', to: 'flop' })).toEqual(
      proveHandoff(scene, { from: 'walk', to: 'flop' }),
    );
    expect(handoffStates(scene, 'walk', 4)).toEqual(handoffStates(scene, 'walk', 4));
  });
});

const scriptedForge = (policyFor: () => Skill['controller']) => {
  const jobs: ForgeJob[] = [];
  const forge: ForgeRunner = async (job) => {
    jobs.push(job);

    const controller = policyFor();

    return controller.kind === 'policy'
      ? { ok: true, policy: controller.policy, events: [{ type: 'done', steps: 1 }], stderr: '' }
      : { ok: false, policy: null, events: [], stderr: 'no policy' };
  };

  return { forge, jobs };
};

function plantedSit(): { scene: KitScene; target: Skill } {
  const flop = clockPolicy(moveEnvironment(quad, quadFlop()));
  const target = fixtureMoveSkill({
    model: quad,
    animation: quadSit(),
    controller: { kind: 'policy', policy: flop, robot: quad.robots[0].key },
  });

  return { scene: sceneOf('quad-servo', quad, [target]), target };
}

describe('Train Hand-off', { timeout: 300_000 }, () => {
  it('retrains a target that falls mid-stride until the pair proves, keeping its contract', async () => {
    const { scene, target } = plantedSit();
    const before = proveHandoff(scene, { from: 'walk', to: 'sit' })!;
    const trained = clockSkill(quad, quadSit());
    const { forge, jobs } = scriptedForge(() => trained.controller);
    const saved: string[] = [];
    const result = await trainHandoff({
      mj,
      scene,
      design: 'quad',
      pair: { from: 'walk', to: 'sit' },
      target,
      environment: moveEnvironment(quad, quadSit()),
      forge,
      save: async (path) => {
        saved.push(path);
      },
    });
    const job = jobs[0].job as { startStates?: unknown[]; warmPolicy?: unknown; backend?: unknown };

    expect(before.falls).toBeGreaterThan(0);
    expect(job.startStates?.length).toBeGreaterThan(0);
    expect(job.warmPolicy).toEqual(target.controller.kind === 'policy' && target.controller.policy);
    expect(job.backend).toBeUndefined();
    expect(result.proof).toEqual({
      seeds: 8,
      falls: 0,
      modelHash: before.modelHash,
      skills: pairStamp({ ...scene, skills: [...library, result.skill!] }, { from: 'walk', to: 'sit' }),
    });
    expect(result.skill?.binding.contract).toBe(target.binding.contract);
    expect(result.skill?.binding.contract).toBe(contractHash(moveEnvironment(quad, quadSit()).contract));
    expect(result.skill?.warmStartFrom).toBe(skillHash(target));
    expect(saved).toHaveLength(1);
  });

  it('drops a candidate that fails Arena and keeps the old skill', async () => {
    const { scene, target } = plantedSit();
    const { forge } = scriptedForge(() => target.controller);
    const result = await trainHandoff({
      mj,
      scene,
      design: 'quad',
      pair: { from: 'walk', to: 'sit' },
      target,
      environment: moveEnvironment(quad, quadSit()),
      forge,
      save: async () => {},
    });

    expect(result.skill).toBeNull();
    expect(result.proof).toBeNull();
    expect(scene.skills).toContain(target);
  });
});
