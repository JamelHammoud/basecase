import { useEffect, useEffectEvent, useState } from 'react';
import type { CaseConsole } from '../cases/console/format';
import { GESTURE_EVENT, gestureNames } from '../cases/gestures';
import { lastInputEvent } from '../sim/inputEvents';
import { createSignalBus, type SignalBus, type SignalSample } from '../cases/console/signalBus';
import { workerJudge, type GoalJudge } from '../cases/goalJudge';
import { liveGoal, type LiveGoal } from '../cases/liveGoal';
import { frameJoints, lastProbes, liveRobot } from '../cases/console/liveSample';
import { caseScoring } from '../cases/console/consoleTrack';
import type { Case } from '../cases/schema';
import type { ScenePart } from '../types/robotics';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { Rig } from '../utils/kinematics';

const PUSH_EVERY_S = 0.05;
const PULSE_MS = 500;

const gesturePulses = (names: string[], now = performance.now()) =>
  Object.fromEntries(
    names.map((name) => {
      const at = lastInputEvent(GESTURE_EVENT, name);

      return [name, at !== null && now - at < PULSE_MS ? 1 : 0];
    }),
  );
const JUDGE_EVERY_MS = 500;

interface ConsoleSignalsInput {
  open: boolean;
  kase: Case | null;
  caseConsole: CaseConsole;
  sim: Simulation;
  running: boolean;
  rig: Rig;
  parts: ScenePart[];
  cameras: string[];
}

export function useConsoleSignals(input: ConsoleSignalsInput): SignalBus {
  const { open, kase, caseConsole, sim } = input;
  const defs = caseConsole.signals;
  const key = `${kase?.id ?? ''}:${JSON.stringify([caseConsole.input, defs ?? []])}`;
  const [held, setHeld] = useState(() => ({ key, bus: createSignalBus(defs) }));
  const bus = held.key === key ? held.bus : null;

  if (!bus) setHeld({ key, bus: createSignalBus(defs) });

  const live = useEffectEvent(() => ({
    running: input.running,
    cameras: input.cameras,
    gestures: caseConsole.input.includes('camera') ? gesturePulses(gestureNames(input.kase?.gestures)) : undefined,
    inputs: Object.fromEntries(caseConsole.input.map((id) => [id, sim.drive.inputs()[id] ?? null])),
    robot: sim.latestStats()?.robots[0],
    time: sim.latestStats()?.time ?? 0,
  }));

  const follow = useEffectEvent((target: SignalBus, model: SimModel) => {
    const theCase = input.kase;

    if (!theCase) return () => {};

    const { contract, reader, world } = caseScoring({ kase: theCase, model, rig: input.rig, parts: input.parts });
    let goal: LiveGoal | null = null;
    let judge: GoalJudge | null = null;
    let judging = false;
    let judged: SignalSample['goal'] = null;
    let lastPush = -Infinity;

    const endGoal = () => {
      judge?.dispose();
      judge = null;
      goal = null;
      judging = false;
    };

    const startGoal = () => {
      judge = workerJudge(contract);
      goal = liveGoal(reader, judge);
      judged = null;
    };

    const stop = sim.subscribePoses((poses, frame) => {
      const now = live();

      if (now.running && !goal) startGoal();

      if (!now.running && goal) endGoal();

      goal?.add(now.time, poses);

      if (now.time - lastPush < PUSH_EVERY_S && now.time >= lastPush) return;

      lastPush = now.time;

      target.push({
        time: now.time,
        running: now.running,
        joints: frameJoints(model, frame.joints),
        robot: liveRobot(now.robot, world, poses),
        probes: lastProbes(reader, poses),
        inputs: now.inputs,
        goal: now.running ? judged : null,
        cameras: now.cameras,
        gestures: now.gestures,
      });
    });
    const timer = setInterval(() => {
      const asked = goal;

      if (!asked || judging) return;

      judging = true;
      void asked.judge().then((result) => {
        if (goal !== asked) return;

        judging = false;
        judged = result && { passed: result.passed, margin: result.margin, failed: result.failed };
      });
    }, JUDGE_EVERY_MS);

    return () => {
      stop();
      clearInterval(timer);
      endGoal();
    };
  });

  const model = sim.model;
  const following = open && !!kase;

  useEffect(() => {
    if (!following || !bus || !model) return;

    return follow(bus, model);
  }, [following, bus, model]);

  return bus ?? held.bus;
}
