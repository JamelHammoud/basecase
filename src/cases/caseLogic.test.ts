import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { withHandoffs } from '../routines/handoffs';
import { loadKitLibrary } from '../routines/kitLibrary';
import { scriptedDrive } from '../routines/physicsDrive';
import { kitForModel, proveHandoff } from '../routines/physicsKit';
import type { Routine, SkillContract, TransitionProof } from '../routines/schema';
import { fixtureRobots } from '../sim/fixtures/robots';
import { modelOf } from '../skills/fixtureModels';
import { clockSkill, quadSit } from '../skills/moveFixtures';
import { compileCaseLogic } from './caseLogic';
import { gameLogic, KNOCK_COMMANDS, knockGame } from './fixtureGames';
import { CASE_FORMAT_VERSION, type Case, type WorldObject } from './schema';
import { parseCase, runCase } from './testing';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;
const proof: TransitionProof = { seeds: 8, falls: 0, modelHash: 'fixture' };
const body = (id: string, transitions: Record<string, TransitionProof>): SkillContract => ({
  id,
  status: 'ready',
  rateHz: 50,
  holds: ['body'],
  startsFrom: ['standing'],
  endsIn: 'standing',
  interrupt: 'any',
  stopVia: 'settle',
  transitions,
});
const DOG_SKILLS = [body('settle', { sit: proof }), body('sit', { settle: proof })];
const SIT_AT = 1;

const sitOnVoice = (sit = 'sit'): Routine => ({
  schema: 1,
  id: 'sit-on-voice',
  name: 'Sit',
  requires: ['legs'],
  base: { kind: 'do', id: 'start', skill: 'settle', holds: ['body'], timeoutMs: 4000, onTimeout: [], onFail: [] },
  watchers: [{ id: 'voice', model: 'live-input', rateHz: 20, maxAgeMs: 300, publishes: { type: 'text' } }],
  reactions: [
    {
      id: 'on-sit',
      when: { fact: 'voice', is: 'sit' },
      cooldownMs: 0,
      onRetrigger: 'ignore',
      body: 'stopFirst',
      steps: [{ kind: 'do', skill: sit, holds: ['body'], timeoutMs: 3000, onTimeout: [], onFail: [] }],
    },
  ],
  safeStop: 'settle',
});

const walkThenSit = (): Routine => {
  const logic = sitOnVoice();
  const sit = logic.reactions[0].steps[0];
  const walk = { ...sit, id: 'walk', skill: 'walk', move: { distance: 0.15, speed: 0.2, heading: 0 } };

  return { ...logic, reactions: [{ ...logic.reactions[0], steps: [walk, { ...sit, id: 'sit' }] }] };
};

function dogCase(logic: Routine): Case {
  return {
    formatVersion: CASE_FORMAT_VERSION,
    id: 'sit-when-told',
    name: 'Sit When Told',
    brief: 'Sit when you hear sit.',
    slot: { needs: ['legs'], binding: {} },
    world: { objects: [] },
    controls: [],
    reference: { timeline: [] },
    task: {
      seconds: 3,
      probes: [],
      contract: {
        version: 1,
        success: { eventually: { window: 'whole', state: { atom: atomAbove('elapsed') } } },
        failures: [],
      },
    },
    logic,
  };
}

const atomAbove = (signal: string) => ({ expr: { signal }, cmp: '>' as const, value: 1, scale: 1 });

const cube = (id: string, x: number, z: number): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  position: [x, 15, z],
  rotation: [0, 0, 0],
  size: [30, 30, 30],
  color: '#e8e8e8',
  behavior: 'dynamic',
  massG: 20,
});

function sortingCase(): Case {
  const game = knockGame({ seconds: 1, target: 2 });
  const bin: WorldObject = { ...game.world.objects[0], id: 'bin', position: [0, 1, 250], size: [120, 2, 120] };

  return {
    ...game,
    id: 'sorting-cell',
    world: { objects: [bin, cube('a', -30, 230), cube('b', 30, 270), cube('c', 200, 250)] },
    task: { ...game.task, score: { spot: 'bin', counts: 'in' } },
  };
}

describe('Case logic', { timeout: 60_000 }, () => {
  it('runs the sit skill within 200 ms of sim time after a recorded sit', async () => {
    const mj = await loadMujoco();
    const result = await runCase(mj, dogCase(sitOnVoice()), robot('quad-servo'), {
      controller: 'reference',
      skills: DOG_SKILLS,
      inputs: [{ at: SIT_AT, name: 'voice', value: 'sit' }],
    });
    const sat = result.logic?.trace.find((e) => e.kind === 'control' && e.skill === 'sit');

    expect(result.refusal).toBeUndefined();
    expect(sat?.t).toBeGreaterThanOrEqual(SIT_AT * 1000);
    expect(sat!.t - SIT_AT * 1000).toBeLessThanOrEqual(200);
  });

  it('scores one per block knocked off its pad, and passes only when the target comes before time runs out', async () => {
    const mj = await loadMujoco();
    const arm = robot('arm-6dof');
    const inTime = await runCase(mj, knockGame({ seconds: 7.5, target: 2, timeline: KNOCK_COMMANDS }), arm, {
      controller: 'reference',
    });
    const late = await runCase(mj, knockGame({ seconds: 4, target: 2, timeline: KNOCK_COMMANDS }), arm, {
      controller: 'reference',
    });
    const score = inTime.trace.signals.score;
    const steps = score.filter((s, i) => i > 0 && s !== score[i - 1]);

    expect(steps).toEqual([1, 2]);
    expect(inTime.logic?.facts.score).toBe(2);
    expect(inTime.logic?.facts.passed).toBe(true);
    expect(inTime.passed).toBe(true);
    expect(late.trace.signals.score.at(-1)).toBe(1);
    expect(late.passed).toBe(false);
  });

  it('counts the blocks inside a spot', async () => {
    const mj = await loadMujoco();
    const result = await runCase(mj, sortingCase(), robot('arm-6dof'), { controller: 'limp' });

    expect(result.logic?.facts['bin-count']).toBe(2);
    expect(result.logic?.facts['c-spot']).toBe('');
    expect(result.logic?.facts['a-spot']).toBe('bin');
    expect(result.trace.signals.score.every((s) => s === 2)).toBe(true);
  });

  it('walks then sits on a voice event once that hand-off is proved', async () => {
    const mj = await loadMujoco();
    const quad = robot('quad-servo');
    const model = modelOf(quad);
    const skills = [...(await loadKitLibrary()), clockSkill(model, quadSit())];
    const scene = { mj, model, joints: quad.joints, skills, drive: scriptedDrive(model, quad.joints, quad.parts) };
    const kit = kitForModel(scene);
    const kase = { ...dogCase(walkThenSit()), task: { ...dogCase(walkThenSit()).task, seconds: 5 } };
    const inputs = [{ at: 0.5, name: 'voice', value: 'sit' }];
    const refused = await runCase(mj, kase, quad, { controller: 'reference', kit, inputs });
    const proof = proveHandoff(scene, { from: 'walk', to: 'sit' })!;
    const proved = withHandoffs(kit, { 'walk->sit': proof });
    const result = await runCase(mj, kase, quad, { controller: 'reference', kit, skills: proved, inputs });
    const controls = (result.logic?.trace ?? []).flatMap((e) => (e.kind === 'control' ? [e.skill] : []));
    const done = (result.logic?.trace ?? []).flatMap((e) => (e.kind === 'opDone' ? [e.node] : []));

    expect(refused.refusal).toBe("walk to sit isn't proven in simulation. Prove it, or stop first.");
    expect(proof.falls).toBe(0);
    expect(result.refusal).toBeUndefined();
    expect(controls.indexOf('sit')).toBeGreaterThan(controls.indexOf('walk'));
    expect(done).toEqual(expect.arrayContaining(['walk', 'sit']));
  });

  it('refuses to run a Case whose logic the compiler refuses, with the compiler’s message', async () => {
    const mj = await loadMujoco();
    const logic = sitOnVoice('backflip');
    const compiled = compileCaseLogic(logic, { skills: DOG_SKILLS });

    expect(compiled.ok).toBe(false);

    const result = await runCase(mj, dogCase(logic), robot('quad-servo'), {
      controller: 'reference',
      skills: DOG_SKILLS,
    });

    expect(result.refusal).toBe(compiled.errors![0].message);
    expect(result.frames).toEqual([]);
  });

  it('runs the same way twice for one seed', async () => {
    const mj = await loadMujoco();
    const kase = knockGame({ seconds: 3, target: 1, timeline: KNOCK_COMMANDS });
    const [a, b] = [
      await runCase(mj, kase, robot('arm-6dof'), { controller: 'reference' }),
      await runCase(mj, kase, robot('arm-6dof'), { controller: 'reference' }),
    ];

    expect(b.trace).toEqual(a.trace);
    expect(b.logic).toEqual(a.logic);
    expect(b.frames.at(-1)?.poses).toEqual(a.frames.at(-1)?.poses);
  });
});

describe('Case files with logic', () => {
  it('keep a Routine and a score through the validator, and old files parse unchanged', () => {
    const kase = knockGame({ seconds: 5, target: 2 });
    const plain: Case = { ...kase, task: { ...kase.task } };

    delete plain.logic;
    delete plain.task.score;

    expect(parseCase(JSON.parse(JSON.stringify(kase)))).toEqual(kase);
    expect(parseCase(JSON.parse(JSON.stringify(plain)))).toEqual(plain);
    expect('logic' in parseCase(plain)).toBe(false);
  });

  it('refuse logic that isn’t a Routine and a score on a spot the world lacks', () => {
    const kase = knockGame({ seconds: 5, target: 2 });

    expect(() => parseCase({ ...kase, logic: { ...gameLogic(5), schema: 9 } })).toThrow(/logic/);
    expect(() => parseCase({ ...kase, task: { ...kase.task, score: { spot: 'nowhere', counts: 'in' } } })).toThrow(
      /score/,
    );
  });
});
