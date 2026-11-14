import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import type { OpenCodeFrames } from '../../../cameras/codeFrameTypes';
import type { DriveCommand } from '../../../sim/driveTypes';
import { SimEngine } from '../../../sim/engine';
import type { FixtureRobot } from '../../../sim/fixtures/parts';
import { fixtureMeasures, fixtureTriangles } from '../../../sim/fixtures/parts';
import { buildMjcf, worldDeltas } from '../../../sim/mjcf';
import { Recorder, type Recording } from '../../../sim/recorder';
import { WorldMover } from '../../../sim/worldMover';
import { DEFAULT_PROJECT } from '../../../types/robotics';
import { buildRig, type V3 } from '../../../utils/kinematics';
import { stageCase, stagedEffectors } from '../../caseCast';
import type { CaseStore } from '../../caseStore';
import { LiveCase } from '../../liveCase';
import { endPoint } from '../../probes';
import { logicPlan } from '../../runCaseLogic';
import { parseCase, worldItem, type Case } from '../../schema';
import { liveController } from '../../testing';
import { caseProbeWorld, scoreTry, type TryScoring } from '../../tries';
import { createSignalBus } from '../signalBus';
import { fakeClock, openTestFrame, type TestFrame } from './codeFrames';

export const STEP_S = 0.02;

export interface LiveCodeInput {
  mj: MainModule;
  kase: Case;
  robot: FixtureRobot;
  source: string;
  seconds?: number;
  store?: CaseStore;
  frames?: (run: LiveRun) => OpenCodeFrames;
  player?: (run: LiveRun, t: number) => void;
  until?: (run: LiveRun) => boolean;
  globals?: Record<string, unknown>;
}

export interface LiveRun {
  engine: SimEngine;
  mover: WorldMover;
  live: LiveCase;
  scoring: Omit<TryScoring, 'recording'>;
  frame: TestFrame;
  objectAt: (id: string) => V3;
  probes: () => Record<string, number>;
  store: () => CaseStore | undefined;
}

export interface LiveCodeResult {
  run: LiveRun;
  recording: Recording;
  verdict: Awaited<ReturnType<typeof scoreTry>>;
  seconds: number;
}

const { setImmediate: nextTurn } = globalThis as unknown as { setImmediate: (run: () => void) => void };

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise<void>((resolve) => nextTurn(resolve));
};

function stage(mj: MainModule, kase: Case, robot: FixtureRobot) {
  const rig = buildRig(robot.joints, robot.parts);
  const staged = stageCase(parseCase(kase), { rig, parts: robot.parts }, []);
  const model = buildMjcf({
    parts: robot.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    world: staged.kase.world.objects.map(worldItem),
  });
  const scoring = { kase: staged.kase, model, rig, ...stagedEffectors(staged, { rig, parts: robot.parts }) };
  const engine = new SimEngine(mj, model);

  return { rig, scoring, engine };
}

export async function liveCodeTry(input: LiveCodeInput): Promise<LiveCodeResult> {
  const { mj, robot } = input;
  const { rig, scoring, engine } = stage(mj, input.kase, robot);
  const kase = scoring.kase;
  const controller = liveController(robot, rig, scoring.model);

  engine.setController(controller);

  const mover = new WorldMover(mj, engine);
  const recorder = new Recorder(engine, controller, mover.current());
  const { plan } = logicPlan(kase, {});
  const live = await LiveCase.start(engine, { kase, plan, joints: robot.joints, kit: null }, () => controller);
  const world = caseProbeWorld(scoring);
  const bus = createSignalBus();
  const clock = fakeClock();
  let store = input.store;

  engine.stepHook = recorder.hook;
  engine.commandHook = recorder.command;

  const probes = () => {
    const poses = engine.poses();

    return Object.fromEntries(
      kase.task.probes.map((p) => [p.signal, endPoint(p.from, world, poses).distanceTo(endPoint(p.to, world, poses))]),
    );
  };
  const objectAt = (id: string): V3 => {
    const rest = kase.world.objects.find((o) => o.id === id)!.position;
    const delta = worldDeltas(scoring.model, engine.poses()).get(id)!;

    return new THREE.Vector3(...rest).applyMatrix4(delta).toArray();
  };
  const run = { engine, mover, live, scoring, objectAt, probes, store: () => store } as LiveRun;

  run.frame = openTestFrame(input.source, {
    bus,
    clock,
    globals: input.globals,
    scope: { declared: new Set(), probes: new Set(kase.task.probes.map((p) => p.signal)), inputs: new Set(['code']) },
    tools: {
      world: { objects: () => kase.world.objects, set: (c) => void (mover.apply(c) && recorder.world(c)) },
      store: { read: () => store, write: (next) => (store = next) },
      ...(input.frames ? { frames: input.frames(run) } : {}),
    },
    studio: {
      drive: (c: DriveCommand | null) => engine.command(c ?? { v: [0, 0, 0] }),
      event: (name, value) => live.input(name, value),
    },
  });

  const seconds = input.seconds ?? kase.task.seconds;
  let t = 0;

  for (; t < seconds - 1e-9 && !input.until?.(run); t += STEP_S) {
    bus.push({ time: t, running: true, joints: [], robot: {}, probes: probes(), inputs: {}, goal: null, cameras: [] });
    clock.tick(STEP_S * 1000);
    await settle();
    input.player?.(run, t);
    live.advance(STEP_S);
  }

  run.frame.close();

  const recording = recorder.finish();
  const verdict = await scoreTry({ ...scoring, recording });

  return { run, recording, verdict, seconds: t };
}
