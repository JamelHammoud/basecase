import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { castOf, stageCase, stagedEffectors, type StagedCase } from '../cases/caseCast';
import { driveFor, slotIndexOf, toCommand } from '../cases/caseDrives';
import { worldItem, type Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { scoreTry, tryManifest, type TryDraft } from '../cases/tries';
import type { RobotDrive } from '../sim/drive';
import type { DriveTeam } from '../sim/useDrive';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { caseLogicPlan } from './caseLogicPlan';
import type { RoutineSkills } from './routineCheck';

export type TryPhase = 'idle' | 'starting' | 'running' | 'scoring';

interface TryOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  joints: RobotJoint[];
  active: Case | null;
  partners: () => SlotRobot[];
  onTry: (draft: TryDraft) => void;
  onRefuse: (message: string) => void;
  skills?: RoutineSkills;
}

export interface CaseTry {
  phase: TryPhase;
  elapsed: number;
  start: () => Promise<void>;
  reference: () => Promise<void>;
  end: () => void;
}

const newTryId = () => `try-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function teamFor(staged: StagedCase, scene: { rig: Rig; parts: ScenePart[] }, all: boolean): DriveTeam {
  const { rig, parts, slots } = castOf(staged, scene);
  const members = staged.slots.flatMap((slot, i) => {
    const setup: RobotDrive | null = i ? driveFor({ slot, cast: slots[i], rig, parts }) : null;

    return setup ? [{ slot: i, setup }] : [];
  });
  const driven = new Set([...(all ? [0] : []), ...members.map((m) => m.slot)]);
  const script = staged.kase.reference.timeline.flatMap((c) => {
    const slot = slotIndexOf(staged.kase, c);

    return driven.has(slot) ? [{ at: c.at, command: toCommand(c, slot) }] : [];
  });

  return { members, script };
}

function refuseDrive(refusal: string | null | false, onRefuse: (message: string) => void) {
  if (refusal) onRefuse(refusal);
}

export function useCaseTry(options: TryOptions): CaseTry {
  const { sim, rig, parts, joints, active, partners, onTry, onRefuse } = options;
  const [phase, setPhase] = useState<TryPhase>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const finishing = useRef(false);
  const input = useRef<string | null>(null);
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

    const staged = stageCase(kase, { rig, parts }, partners());
    const verdict = await scoreTry({
      kase: staged.kase,
      model,
      recording,
      rig,
      ...stagedEffectors(staged, { rig, parts }),
    });
    const record = {
      id: newTryId(),
      caseId: kase.id,
      robot: rig.robots[0]?.name ?? 'Robot',
      at: new Date().toISOString(),
      passed: verdict.passed,
      margin: verdict.margin,
      seconds: recording.frames * recording.dt,
      manifest: await tryManifest(staged.kase, model, recording),
    };

    onTry({ record, recording, input: input.current });
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

  const begin = async (all: boolean) => {
    if (!active || phase !== 'idle') return;

    setPhase('starting');

    const staged = stageCase(active, { rig, parts }, partners());
    const kase = staged.kase;
    const logic = await caseLogicPlan(kase, { parts, joints, buildModel: sim.buildModel, skills: options.skills });

    if (logic.refusal) onRefuse(logic.refusal);

    if (!logic.refusal && staged.slots.length > 1)
      sim.setWorld(staged.kase.world.objects.map(worldItem), staged.joined);

    if (logic.refusal || !(await sim.drive.start(teamFor(staged, { rig, parts }, all)))) {
      refuseDrive(!logic.refusal && sim.drive.refusal(), onRefuse);
      setPhase('idle');

      return;
    }

    input.current = all ? 'script' : null;
    setStartedAt(sim.latestStats()?.time ?? 0);
    sim.runCase({ kase, plan: logic.plan, joints, kit: logic.kit });
    sim.record();
    setPhase('running');
  };

  return { phase, elapsed, start: () => begin(false), reference: () => begin(true), end: () => void finish() };
}
