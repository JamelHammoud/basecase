import { describe, expect, it } from 'vitest';
import type { VisionResult } from '../vision/types';
import { compileRoutine } from './compile';
import { FIXTURE_SKILLS } from './fixtureSkills';
import { greetingRoutine } from './greeting';
import { startScenario, runScenario } from './scenario';
import { RoutineVisionFacts } from './visionFacts';

const emptyFrame: VisionResult = {
  modelId: 'rfdetr-nano',
  timestamp: 200,
  width: 640,
  height: 480,
  detections: [],
};

const scenario = {
  covers: 'real camera results replace mock senses',
  world: [],
  mocks: { person: true },
  faults: [],
  seconds: 2,
  expect: [],
};

function planWithCup() {
  const routine = greetingRoutine();

  routine.watchers[1] = { ...routine.watchers[1], model: 'object-detection', label: 'cup' };

  return compileRoutine(routine, { skills: FIXTURE_SKILLS }).plan!;
}

describe('camera results in the coordinator', () => {
  it('preserves object labels and capture freshness instead of refreshing old observations', () => {
    const plan = planWithCup();
    const vision = new RoutineVisionFacts(plan);
    const watcher = plan.watchers[1];

    expect(watcher.label).toBe('cup');
    expect(vision.read(watcher, 0)).toBeUndefined();
    vision.accept(emptyFrame, 100);
    expect(vision.read(watcher, 200)?.num).toBe(0);
    expect(vision.read(watcher, 601)).toBeUndefined();
    vision.accept({ ...emptyFrame, timestamp: 100, detections: [{ label: 'cup', score: 1, box: [0, 0, 1, 1] }] }, 650);
    expect(vision.read(watcher, 650)).toBeUndefined();
  });

  it('withholds a frame until its capture time', () => {
    const plan = planWithCup();
    const vision = new RoutineVisionFacts(plan);

    vision.accept(emptyFrame, 200);
    expect(vision.read(plan.watchers[1], 199)).toBeUndefined();
    expect(vision.read(plan.watchers[1], 200)?.num).toBe(0);
  });

  it('does not fire a supplied true mock when the supplied detection frame has no cup', async () => {
    const plan = planWithCup();
    const rig = await startScenario(plan, scenario);

    rig.host.vision = new RoutineVisionFacts(plan);
    rig.host.vision.accept(emptyFrame, 0);
    rig.clock.runUntil(2000);
    expect(rig.host.trace.some((event) => event.kind === 'fired' && event.reaction === 'greet')).toBe(false);
  });

  it('refuses L2 without rendered frames and a detector instead of falling back to mocks', async () => {
    await expect(runScenario(planWithCup(), { ...scenario, tier: 'L2' })).rejects.toThrow('rendered camera frames');
  });
});

describe('multiple camera observations', () => {
  it('keeps a wrist detection when a second camera sees nothing and expires each capture separately', () => {
    const plan = planWithCup();
    const vision = new RoutineVisionFacts(plan);
    const watcher = plan.watchers[1];
    const wrist = {
      ...emptyFrame,
      camera: 'wrist',
      detections: [{ label: 'cup', score: 1, box: [0, 0, 1, 1] as [number, number, number, number] }],
    };

    vision.accept(wrist, 100);
    vision.accept({ ...emptyFrame, camera: 'scene' }, 300);
    expect(vision.read(watcher, 400)?.num).toBe(1);
    expect(vision.read(watcher, 650)?.num).toBe(0);
    expect(vision.read(watcher, 850)).toBeUndefined();
    expect(vision.accept(wrist, 900)).toBe(false);
    expect(vision.read(watcher, 900)).toBeUndefined();
  });
});

function inferPlan() {
  const routine = greetingRoutine();

  routine.watchers = [];
  routine.reactions = [];
  routine.base.timeoutMs = 100;
  routine.base.onTimeout = [
    {
      kind: 'infer',
      id: 'checkCup',
      model: 'object-detection',
      input: 'camera',
      output: { type: 'boolean' },
      timeoutMs: 300,
      onTimeout: [],
      onFail: [],
    },
  ];

  return compileRoutine(routine, { skills: FIXTURE_SKILLS }).plan!;
}

describe('inference awaiting a camera frame', () => {
  it('waits for the first fresh result within the step time limit', async () => {
    const plan = inferPlan();
    const rig = await startScenario(plan, scenario);

    rig.host.vision = new RoutineVisionFacts(plan);
    rig.clock.runUntil(200);
    expect(rig.host.trace.some((event) => event.kind === 'result')).toBe(false);
    rig.host.vision.accept(emptyFrame, 200);
    rig.clock.runUntil(300);
    expect(rig.host.trace).toContainEqual(expect.objectContaining({ kind: 'result', node: 'checkCup', value: 0 }));
    expect(rig.host.trace.some((event) => event.kind === 'opTimeout' && event.node === 'checkCup')).toBe(false);
  });

  it('waits until capture time and completes once when two cameras arrive before a clock tick', async () => {
    const plan = inferPlan();
    const rig = await startScenario(plan, scenario);

    rig.host.vision = new RoutineVisionFacts(plan);
    rig.clock.runUntil(180);
    rig.host.vision.accept({ ...emptyFrame, camera: 'wrist' }, 200);
    rig.host.vision.accept({ ...emptyFrame, camera: 'scene' }, 200);
    rig.clock.runUntil(199);
    expect(rig.host.trace.filter((event) => event.kind === 'result')).toEqual([]);
    rig.clock.runUntil(500);
    expect(rig.host.trace.filter((event) => event.kind === 'result')).toEqual([
      expect.objectContaining({ node: 'checkCup', value: 0, t: 200 }),
    ]);
  });

  it('wakes at the capture time of a future frame already present when inference starts', async () => {
    const plan = inferPlan();
    const rig = await startScenario(plan, scenario);

    rig.host.vision = new RoutineVisionFacts(plan);
    rig.host.vision.accept(emptyFrame, 200);
    rig.clock.runUntil(199);
    expect(rig.host.trace.some((event) => event.kind === 'result')).toBe(false);
    rig.clock.runUntil(300);
    expect(rig.host.trace).toContainEqual(expect.objectContaining({ kind: 'result', node: 'checkCup', t: 200 }));
  });

  it('ignores a queued future frame when the step times out before its capture', async () => {
    const plan = inferPlan();
    const rig = await startScenario(plan, scenario);

    rig.host.vision = new RoutineVisionFacts(plan);
    rig.clock.runUntil(180);
    rig.host.vision.accept(emptyFrame, 500);
    rig.clock.runUntil(600);
    expect(rig.host.trace).toContainEqual(expect.objectContaining({ kind: 'opTimeout', node: 'checkCup' }));
    expect(rig.host.trace.some((event) => event.kind === 'result' && event.node === 'checkCup')).toBe(false);
  });

  it('does not complete after its timeout when a detector finally answers', async () => {
    const plan = inferPlan();
    const rig = await startScenario(plan, scenario);

    rig.host.vision = new RoutineVisionFacts(plan);
    rig.clock.runUntil(500);
    rig.host.vision.accept(emptyFrame, 500);
    rig.clock.runUntil(600);
    expect(rig.host.trace).toContainEqual(expect.objectContaining({ kind: 'opTimeout', node: 'checkCup' }));
    expect(rig.host.trace.some((event) => event.kind === 'result' && event.node === 'checkCup')).toBe(false);
  });
});
