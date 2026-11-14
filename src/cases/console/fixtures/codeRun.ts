import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { SimEngine } from '../../../sim/engine';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../../../sim/fixtures/parts';
import { buildMjcf } from '../../../sim/mjcf';
import { worldDeltas } from '../../../sim/mjcfFrames';
import { Recorder, type Recording } from '../../../sim/recorder';
import { WorldMoves } from '../../../sim/worldMoves';
import { DEFAULT_PROJECT } from '../../../types/robotics';
import { buildRig, type V3 } from '../../../utils/kinematics';
import { stageCase, stagedEffectors } from '../../caseCast';
import { robotFacts } from '../../robotFit';
import { movableWorld } from '../../scale';
import { LiveCase } from '../../liveCase';
import { endPoint } from '../../probes';
import { logicPlan } from '../../runCaseLogic';
import { worldItem, type Case } from '../../schema';
import { liveController } from '../../testing';
import { caseProbeReader, caseProbeWorld, scoreTry, type TryScoring } from '../../tries';
import { stagedChange, type WorldChange } from '../../worldSet';
import type { BridgeStore } from '../codeStore';
import type { FrameSource } from '../codeStreams';
import { createSignalBus } from '../signalBus';
import { fakeClock, openTestFrame, type TestFrame } from './codeFrames';

export const TICK_S = 0.02;

export interface CodeRunInput {
  robot: FixtureRobot;
  kase: Case;
  html: string;
  frames?: FrameSource;
  store?: BridgeStore;
  globals?: Record<string, unknown>;
}

export interface CodeRun {
  engine: SimEngine;
  world: WorldMoves;
  scoring: Omit<TryScoring, 'recording'>;
  frame: TestFrame;
  time: () => number;
  objectAt: (id: string) => V3;
  hand: () => V3;
  step: (seconds: number, onTick?: (t: number) => void) => Promise<void>;
  finish: () => Promise<{ recording: Recording; passed: boolean; margin: number }>;
}

const STOP = { v: [0, 0, 0] as V3 };

const nextTask = () => new Promise((done) => setTimeout(done, 0));

function modelFor(robot: FixtureRobot, kase: Case) {
  const rig = buildRig(robot.joints, robot.parts);
  const staged = stageCase(kase, { rig, parts: robot.parts }, []);
  const model = buildMjcf({
    parts: robot.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    world: staged.kase.world.objects.map(worldItem),
  });

  return {
    model,
    staged,
    movable: movableWorld(kase, robotFacts(rig, robot.parts)),
    scoring: { kase: staged.kase, model, rig, ...stagedEffectors(staged, { rig, parts: robot.parts }) },
  };
}

export async function openCodeRun(mj: MainModule, input: CodeRunInput): Promise<CodeRun> {
  const { model, staged, movable, scoring } = modelFor(input.robot, input.kase);
  const controller = liveController(input.robot, scoring.rig, model);
  const engine = new SimEngine(mj, model);

  engine.setController(controller);

  const world = new WorldMoves(mj, engine);
  const recorder = new Recorder(engine, controller, world);
  const { plan } = logicPlan(staged.kase, {});
  const live = await LiveCase.start(
    engine,
    { kase: staged.kase, plan, joints: input.robot.joints, kit: null },
    () => controller,
  );
  const reader = caseProbeReader(scoring);
  const probeWorld = caseProbeWorld(scoring);
  const bus = createSignalBus();
  const clock = fakeClock();
  let t = 0;

  engine.stepHook = recorder.hook;
  engine.commandHook = recorder.command;

  const change = (c: WorldChange) => {
    const placed = stagedChange(movable, c);
    const refusal = typeof placed === 'string' ? placed : world.apply(placed);

    if (typeof placed !== 'string' && !refusal) recorder.worldChange(placed);

    return refusal;
  };

  const frame = openTestFrame(input.html, {
    bus,
    scope: { declared: new Set(), probes: new Set(staged.kase.task.probes.map((p) => p.signal)), inputs: new Set() },
    clock,
    world: change,
    drive: (command) => engine.command(command ?? STOP),
    event: (name, value) => live.input(name, value),
    ...(input.frames ? { frames: input.frames } : {}),
    ...(input.store ? { store: input.store } : {}),
    ...(input.globals ? { globals: input.globals } : {}),
  });

  const push = () => {
    const poses = engine.poses();
    const probes: Record<string, number[]> = {};
    const base = endPoint('base', probeWorld, poses);

    reader.sample(poses, probes);
    bus.push({
      time: t,
      running: true,
      joints: [],
      robot: { x: base.x, z: base.z },
      probes: Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, v.at(-1) ?? 0])),
      inputs: {},
      goal: null,
      cameras: [],
    });
  };

  return {
    engine,
    world,
    scoring,
    frame,
    time: () => t,
    objectAt: (id) => {
      const rest = staged.kase.world.objects.find((o) => o.id === id)!.position;
      const delta = worldDeltas(model, engine.poses()).get(id) ?? new THREE.Matrix4();

      return new THREE.Vector3(...rest).applyMatrix4(delta).toArray();
    },
    hand: () => endPoint('end-effector', probeWorld, engine.poses()).toArray(),
    async step(seconds, onTick) {
      const end = t + seconds - 1e-9;

      while (t < end) {
        push();
        clock.tick(TICK_S * 1000);
        await nextTask();
        onTick?.(t);
        live.advance(TICK_S);
        t += TICK_S;
      }
    },
    async finish() {
      frame.close();

      const recording = recorder.finish();
      const verdict = await scoreTry({ ...scoring, recording });

      engine.dispose();

      return { recording, passed: verdict.passed, margin: verdict.margin };
    },
  };
}
