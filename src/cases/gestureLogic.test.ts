import { describe, expect, it } from 'vitest';
import {
  armCircle,
  clap,
  nod,
  openPalm,
  pointLeft,
  pointRight,
  raiseBothHands,
  saluteMotion,
  shakeHead,
  SMALL_AND_FAR,
  thumbsUp,
  walkPastScratching,
  wave,
} from '../cameras/gestures/fixtures/gestures';
import { exampleFrom, recognize, type FiredGesture } from '../cameras/gestures/gestureRecognizer';
import type { PoseSample } from '../cameras/operator/poseFollow';
import { FIXTURE_MODEL_HASH } from '../routines/fixtureSkills';
import type { Condition, DoStep, Reaction, Routine, SkillContract, Step } from '../routines/schema';
import type { SimEngine } from '../sim/engine';
import { CaseLogicRun, compileCaseLogic } from './caseLogic';
import { gestureActions } from './console/panelKinds';
import { GESTURE_EVENT, type CaseGesture } from './gestures';
import { CASE_FORMAT_VERSION, parseCase, type Case } from './schema';

const SECONDS = 8;
const REACT_MS = 300;
const proof = { seeds: 32, falls: 0, modelHash: FIXTURE_MODEL_HASH };

function skillSet(ids: string[]): SkillContract[] {
  return ids.map((id) => ({
    id,
    status: 'ready',
    rateHz: 50,
    holds: ['body'],
    startsFrom: ['any'],
    endsIn: 'any',
    interrupt: 'any',
    stopVia: ids[0],
    transitions: Object.fromEntries(ids.filter((other) => other !== id).map((other) => [other, proof])),
  }));
}

const does = (skill: string, ms = 1500): DoStep => ({
  kind: 'do',
  skill,
  holds: ['body'],
  timeoutMs: ms,
  onTimeout: [],
  onFail: [],
});

const shows = (gesture: string): Condition => ({ fact: GESTURE_EVENT, is: gesture });

const on = (gesture: string, steps: Step[]): Reaction => ({
  id: `on-${gesture}`,
  when: shows(gesture),
  cooldownMs: 0,
  onRetrigger: 'ignore',
  body: 'stopFirst',
  steps,
});

function logic(base: string, reactions: Reaction[]): Routine {
  return {
    schema: 1,
    id: 'gestures',
    name: 'Gestures',
    requires: ['camera', 'legs'],
    base: does(base, SECONDS * 1000),
    watchers: [{ id: GESTURE_EVENT, model: 'live-input', rateHz: 20, maxAgeMs: 300, publishes: { type: 'text' } }],
    reactions,
    safeStop: base,
  };
}

function gestureCase(routine: Routine, gestures?: CaseGesture[]): Case {
  return parseCase({
    formatVersion: CASE_FORMAT_VERSION,
    id: 'gestures',
    name: 'Gestures',
    brief: 'React to the person at the camera.',
    slot: { needs: [], binding: {} },
    world: { objects: [] },
    controls: [],
    reference: { timeline: [] },
    task: {
      seconds: SECONDS,
      probes: [],
      contract: {
        version: 1,
        success: {
          eventually: {
            window: 'whole',
            state: { atom: { expr: { signal: 'elapsed' }, cmp: '>', value: 1, scale: 1 } },
          },
        },
        failures: [],
      },
    },
    logic: routine,
    ...(gestures ? { gestures } : {}),
  });
}

async function runLogic(kase: Case, skills: string[], fired: FiredGesture[]) {
  const compiled = compileCaseLogic(kase.logic!, { skills: skillSet(skills), modelHash: FIXTURE_MODEL_HASH });

  if (!compiled.ok) throw new Error(compiled.errors[0].message);

  const engine = {} as SimEngine;
  const run = await CaseLogicRun.start({
    plan: compiled.plan,
    seconds: SECONDS,
    engine,
    body: null,
    handBack: () => {},
  });

  for (const g of fired) run.input({ at: g.at, name: GESTURE_EVENT, value: g.name });

  for (let ms = 0; ms <= SECONDS * 1000; ms += 20) run.advance(ms, {});

  return run.result().trace.flatMap((e) => (e.kind === 'control' && e.skill ? [{ t: e.t, skill: e.skill }] : []));
}

const delay = (samples: PoseSample[], seconds: number) => samples.map((s) => ({ ...s, t: s.t + seconds * 1000 }));

async function reacts(options: { motion: PoseSample[]; base: string; reactions: Reaction[]; skills: string[] }) {
  const fired = recognize(options.motion);
  const control = await runLogic(gestureCase(logic(options.base, options.reactions)), options.skills, fired);

  return { fired, control };
}

const startedAfter = (control: Array<{ t: number; skill: string }>, skill: string, at: number) =>
  control.find((c) => c.skill === skill && c.t >= at * 1000 && c.t - at * 1000 <= REACT_MS);

describe('gestures drive a Case’s logic', { timeout: 30_000 }, () => {
  it('waves the biped back when the person waves', async () => {
    const { fired, control } = await reacts({
      motion: wave(),
      base: 'stand',
      reactions: [on('wave', [does('wave')])],
      skills: ['stand', 'wave'],
    });

    expect(fired.map((g) => g.name)).toEqual(['wave']);
    expect(startedAfter(control, 'wave', fired[0].at)).toBeDefined();
  });

  it('stops a driving rover on Raise Both Hands', async () => {
    const { fired, control } = await reacts({
      motion: raiseBothHands(),
      base: 'cruise',
      reactions: [on('raise-both-hands', [does('stop', 4000)])],
      skills: ['cruise', 'stop'],
    });

    expect(startedAfter(control, 'stop', fired[0].at)).toBeDefined();
  });

  it('turns the rover left and right on Point Left and Point Right', async () => {
    const motion = [...pointLeft(), ...delay(pointRight(), 3)];
    const { fired, control } = await reacts({
      motion,
      base: 'cruise',
      reactions: [on('point-left', [does('turn-left')]), on('point-right', [does('turn-right')])],
      skills: ['cruise', 'turn-left', 'turn-right'],
    });

    expect(fired.map((g) => g.name)).toEqual(['point-left', 'point-right']);
    expect(startedAfter(control, 'turn-left', fired[0].at)).toBeDefined();
    expect(startedAfter(control, 'turn-right', fired[1].at)).toBeDefined();
  });

  it('starts a try on Thumbs Up through a console button the gesture presses', () => {
    const fired = recognize(thumbsUp());
    const panels = [{ id: 'go', kind: 'button' as const, action: 'try' as const, gesture: 'thumbs-up' }];

    expect(fired.flatMap((g) => gestureActions(panels, g.name))).toEqual(['try']);
  });

  it('toggles the arm’s gripper on each clap', async () => {
    const { fired, control } = await reacts({
      motion: clap(2),
      base: 'hold',
      reactions: [on('clap', [does('toggle-grip')])],
      skills: ['hold', 'toggle-grip'],
    });

    expect(fired).toHaveLength(2);
    expect(fired.every((g) => startedAfter(control, 'toggle-grip', g.at))).toBe(true);
  });

  it('confirms an ask with a nod and cancels it with a shake of the head', async () => {
    const ask: Step[] = [
      { kind: 'wait', until: { any: [shows('nod'), shows('shake-head')] }, timeoutMs: 4000, onTimeout: [], onFail: [] },
      { kind: 'if', test: shows('nod'), then: [does('sit')], else: [does('stand')] },
    ];
    const reactions = [on('wave', ask)];
    const yes = await reacts({
      motion: [...wave(), ...delay(nod(), 3)],
      base: 'stand',
      reactions,
      skills: ['stand', 'sit'],
    });
    const no = await reacts({
      motion: [...wave(), ...delay(shakeHead(), 3)],
      base: 'stand',
      reactions,
      skills: ['stand', 'sit'],
    });

    expect(yes.fired.map((g) => g.name)).toEqual(['wave', 'nod']);
    expect(startedAfter(yes.control, 'sit', yes.fired[1].at)).toBeDefined();
    expect(no.fired.map((g) => g.name)).toEqual(['wave', 'shake-head']);
    expect(no.control.some((c) => c.skill === 'sit')).toBe(false);
  });

  it('holds the quadruped in Stand on Open Palm', async () => {
    const { fired, control } = await reacts({
      motion: openPalm(),
      base: 'walk',
      reactions: [on('open-palm', [does('stand', 3000)])],
      skills: ['walk', 'stand'],
    });

    expect(startedAfter(control, 'stand', fired[0].at)).toBeDefined();
  });

  it('bows the dog on a taught salute, and a wave doesn’t', async () => {
    const salute: CaseGesture = { name: 'salute', examples: [0, 1, 2].map((v) => exampleFrom(saluteMotion(v))!) };
    const kase = gestureCase(logic('stand', [on('salute', [does('bow')])]), [salute]);
    const saluted = recognize(saluteMotion(3), kase.gestures);
    const waved = recognize(wave(), kase.gestures);

    expect(saluted.map((g) => g.name)).toEqual(['salute']);
    expect(waved.map((g) => g.name)).toEqual(['wave']);
    expect(startedAfter(await runLogic(kase, ['stand', 'bow'], saluted), 'bow', saluted[0].at)).toBeDefined();
    expect((await runLogic(kase, ['stand', 'bow'], waved)).some((c) => c.skill === 'bow')).toBe(false);
  });

  it('turns the hexapod on the spot on a taught arm circle', async () => {
    const circle: CaseGesture = { name: 'arm-circle', examples: [0, 1, 2].map((v) => exampleFrom(armCircle(v))!) };
    const kase = gestureCase(logic('stand', [on('arm-circle', [does('turn-on-spot')])]), [circle]);
    const fired = recognize(armCircle(3), kase.gestures);

    expect(fired.map((g) => g.name)).toEqual(['arm-circle']);
    expect(
      startedAfter(await runLogic(kase, ['stand', 'turn-on-spot'], fired), 'turn-on-spot', fired[0].at),
    ).toBeDefined();
  });

  it('waves back at a smaller person further away', async () => {
    const { fired, control } = await reacts({
      motion: wave({ person: SMALL_AND_FAR, facingDeg: 20 }),
      base: 'stand',
      reactions: [on('wave', [does('wave')])],
      skills: ['stand', 'wave'],
    });

    expect(startedAfter(control, 'wave', fired[0].at)).toBeDefined();
  });

  it('does nothing for someone walking past and scratching their head', async () => {
    const { fired, control } = await reacts({
      motion: walkPastScratching(),
      base: 'stand',
      reactions: [on('wave', [does('wave')]), on('clap', [does('wave')])],
      skills: ['stand', 'wave'],
    });

    expect(fired).toEqual([]);
    expect(control.every((c) => c.skill === 'stand')).toBe(true);
  });
});
