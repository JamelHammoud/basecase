import { useEffect, useEffectEvent, useState } from 'react';
import type { CaseConsole } from '../cases/console/format';
import { createSignalBus, type SignalBus, type SignalSample } from '../cases/console/signalBus';
import { liveGoal, type LiveGoal } from '../cases/liveGoal';
import { endPoint } from '../cases/probes';
import { boundEffector, robotFacts } from '../cases/robotFit';
import { scaledToReach } from '../cases/scale';
import type { Case } from '../cases/schema';
import { caseProbeReader, caseProbeWorld } from '../cases/tries';
import type { SimModel } from '../sim/mjcfTypes';
import type { SimFrame, Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';

const PUSH_EVERY_S = 0.05;
const JUDGE_EVERY_MS = 500;
const D2R = Math.PI / 180;

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

const jointsOf = (model: SimModel, { joints }: SimFrame): SignalSample['joints'] =>
  model.joints.map((j, i) => {
    const unit = j.type === 'revolute' ? D2R : 0.001;

    return { id: j.id, target: joints[i * 3] / unit, position: joints[i * 3 + 1] / unit, effort: joints[i * 3 + 2] };
  });

function caseWorld({ kase, model, rig, parts }: { kase: Case; model: SimModel; rig: Rig; parts: ScenePart[] }) {
  const facts = robotFacts(rig, parts);
  const scaled = scaledToReach(kase, facts.reachMm, facts.anchor);
  const scoring = { kase: scaled, model, effector: boundEffector(scaled.slot.binding, facts, rig), rig };

  return { contract: scaled.task.contract, reader: caseProbeReader(scoring), world: caseProbeWorld(scoring) };
}

export function useConsoleSignals(input: ConsoleSignalsInput): SignalBus {
  const { open, kase, caseConsole, sim } = input;
  const defs = caseConsole.signals;
  const key = `${kase?.id ?? ''}:${JSON.stringify(caseConsole)}`;
  const [held, setHeld] = useState(() => ({ key, bus: createSignalBus(defs) }));
  const bus = held.key === key ? held.bus : null;

  if (!bus) setHeld({ key, bus: createSignalBus(defs) });

  const live = useEffectEvent(() => ({
    running: input.running,
    cameras: input.cameras,
    inputs: Object.fromEntries(caseConsole.input.map((id) => [id, sim.drive.inputs()[id] ?? null])),
    robot: sim.latestStats()?.robots[0],
    time: sim.latestStats()?.time ?? 0,
  }));

  const follow = useEffectEvent((target: SignalBus, model: SimModel) => {
    const theCase = input.kase;

    if (!theCase) return () => {};

    const { contract, reader, world } = caseWorld({ kase: theCase, model, rig: input.rig, parts: input.parts });
    let goal: LiveGoal | null = null;
    let judged: SignalSample['goal'] = null;
    let lastPush = -Infinity;

    const stop = sim.subscribePoses((poses, frame) => {
      const now = live();

      if (now.running && !goal) judged = null;

      goal = now.running ? (goal ?? liveGoal(contract, reader)) : null;
      goal?.add(now.time, poses);

      if (now.time - lastPush < PUSH_EVERY_S && now.time >= lastPush) return;

      lastPush = now.time;

      const probes: Record<string, number[]> = {};

      reader.sample(poses, probes);

      const base = endPoint('base', world, poses);
      const { robot } = now;

      target.push({
        time: now.time,
        running: now.running,
        joints: jointsOf(model, frame),
        robot: {
          ...(robot && { height: robot.height, tilt: robot.tilt, speed: robot.speed, travelled: robot.travelled }),
          x: base.x,
          z: base.z,
        },
        probes: Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, v.at(-1) ?? 0])),
        inputs: now.inputs,
        goal: now.running ? judged : null,
        cameras: now.cameras,
      });
    });
    const timer = setInterval(() => {
      void goal?.judge().then((result) => {
        judged = result && { passed: result.passed, margin: result.margin, failed: result.failed };
      });
    }, JUDGE_EVERY_MS);

    return () => {
      stop();
      clearInterval(timer);
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
