import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { boundEffector, robotFacts } from '../cases/robotFit';
import { scaledToReach } from '../cases/scale';
import type { Case } from '../cases/schema';
import { scoreTry, tryManifest, type TryRecord } from '../cases/tries';
import { saveRecording } from '../cases/tryStore';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { caseLogicPlan } from './caseLogicPlan';

export type TryPhase = 'idle' | 'starting' | 'running' | 'scoring';

interface TryOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  joints: RobotJoint[];
  active: Case | null;
  onTry: (record: TryRecord) => void;
  onRefuse: (message: string) => void;
}

export interface CaseTry {
  phase: TryPhase;
  elapsed: number;
  start: () => Promise<void>;
  end: () => void;
}

const newTryId = () => `try-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const scaledCase = (kase: Case, rig: Rig, parts: ScenePart[]) => {
  const facts = robotFacts(rig, parts);

  return scaledToReach(kase, facts.reachMm, facts.anchor);
};

export function useCaseTry({ sim, rig, parts, joints, active, onTry, onRefuse }: TryOptions): CaseTry {
  const [phase, setPhase] = useState<TryPhase>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const finishing = useRef(false);
  const time = sim.stats?.time ?? 0;
  const elapsed = phase === 'running' ? Math.max(0, time - startedAt) : 0;

  const finish = async () => {
    if (finishing.current) return;

    finishing.current = true;

    const kase = active;
    const model = sim.model;
    const recording = await sim.stopRecording();

    sim.runCase(null);
    setPhase('scoring');

    if (!kase || !model || !recording) {
      setPhase('idle');
      finishing.current = false;

      return;
    }

    const facts = robotFacts(rig, parts);
    const scaled = scaledCase(kase, rig, parts);
    const effector = boundEffector(scaled.slot.binding, facts, rig);
    const verdict = await scoreTry({ kase: scaled, model, recording, effector, rig });
    const id = newTryId();

    await saveRecording(id, recording);
    onTry({
      id,
      caseId: kase.id,
      robot: rig.robots[0]?.name ?? 'Robot',
      at: new Date().toISOString(),
      passed: verdict.passed,
      margin: verdict.margin,
      seconds: recording.frames * recording.dt,
      manifest: await tryManifest(scaled, model, recording),
    });
    sim.drive.stop();
    setPhase('idle');
    finishing.current = false;
  };

  const finishFromEffect = useEffectEvent(() => {
    void finish();
  });

  const running = phase === 'running';
  const outOfTime = running && !!active && elapsed >= active.task.seconds;
  const leftDrive = running && !sim.drive.active;

  useEffect(() => {
    if (!outOfTime && !leftDrive) return;

    const soon = setTimeout(finishFromEffect, 0);

    return () => clearTimeout(soon);
  }, [outOfTime, leftDrive]);

  const start = async () => {
    if (!active || phase !== 'idle') return;

    setPhase('starting');

    const kase = scaledCase(active, rig, parts);
    const logic = await caseLogicPlan(kase, { parts, joints, buildModel: sim.buildModel });

    if (logic.refusal) onRefuse(logic.refusal);

    if (logic.refusal || !(await sim.drive.start())) {
      setPhase('idle');

      return;
    }

    setStartedAt(sim.latestStats()?.time ?? 0);
    sim.runCase({ kase, plan: logic.plan, joints, kit: logic.kit });
    sim.record();
    setPhase('running');
  };

  return { phase, elapsed, start, end: () => void finish() };
}
