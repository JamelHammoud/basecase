import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { castOf, stageCase, type StagedCase } from '../cases/caseCast';
import { driveFor, slotIndexOf, toCommand } from '../cases/caseDrives';
import type { Case } from '../cases/schema';
import { caseWorldItems } from '../cases/importedWorldItems';
import type { SlotRobot } from '../cases/slots';
import { type TryRecord } from '../cases/tries';
import type { RobotDrive } from '../sim/drive';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import type { DriveTeam } from '../sim/useDrive';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import type { Rig } from '../utils/kinematics';
import { caseLogicPlan } from './caseLogicPlan';
import type { RoutineSkills } from './routineCheck';
import { useCaseVision } from './useCaseVision';
import { caseTryRecord } from './caseTryRecord';
import { useCaseBranch, type BranchTryInput, type BranchTryContext } from './useCaseBranch';
import { useStartupLease } from './useStartupLease';
import { useTryEvidence } from './useTryEvidence';

export type TryPhase = 'idle' | 'starting' | 'running' | 'scoring';

interface TryOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  joints: RobotJoint[];
  active: Case | null;
  scope: Case | null;
  partners: () => SlotRobot[];
  onTry: (record: TryRecord, recording: Recording, input: string | null) => Promise<void>;
  onRefuse: (message: string) => void;
  skills?: RoutineSkills;
  branchScope?: unknown;
  onBranchTry?: (record: TryRecord, recording: Recording, current: () => boolean) => Promise<void>;
}

export interface CaseTry {
  phase: TryPhase;
  elapsed: number;
  start: () => Promise<void>;
  reference: () => Promise<void>;
  end: () => void;
  branching: boolean;
  cancelBranch: () => void;
  branch: (input: BranchTryInput) => Promise<boolean>;
}

const MIN_FRAMES = 2;

const TOO_SHORT = 'Play the simulation to record a try.';
const SOURCE_EDITED = 'Record a new try after editing the Case or robot.';

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
  const branch = useCaseBranch({ sim, scope: options.branchScope ?? options.scope, setPhase, setStartedAt, onRefuse });
  const finishing = useRef(false);
  const scripted = useRef(false);
  const evidence = useTryEvidence(options);
  const lease = useStartupLease(options.scope, sim.subscribeStop, () =>
    setPhase((value) => (value === 'starting' ? 'idle' : value)),
  );
  const vision = useCaseVision(lease);
  const time = sim.stats?.time ?? 0;
  const elapsed = phase === 'running' ? Math.max(0, time - startedAt) : 0;

  const keep = async (input: { kase: Case; model: SimModel; recording: Recording; held: BranchTryContext | null }) => {
    const { recording, held, kase, model } = input;
    const record = await caseTryRecord({
      kase,
      model,
      recording,
      scene: { rig, parts, partners: partners() },
      branch: held,
    });

    if (held && !branch.valid(held)) return;

    if (!held && !evidence.current()) return onRefuse(SOURCE_EDITED);

    if (held && options.onBranchTry) return options.onBranchTry(record, recording, () => branch.valid(held));

    await onTry(record, recording, scripted.current ? 'script' : null);
  };

  const score = async () => {
    const held = branch.context();
    const kase = held?.scoring.kase ?? active;
    const model = held?.scoring.model ?? sim.model;

    if (held) sim.pause();

    const recording = await sim.stopRecording();

    vision.release();
    sim.runCase(null);
    setPhase('scoring');

    if (!kase || !model || !recording) return;

    if (recording.frames < MIN_FRAMES) return onRefuse(TOO_SHORT);

    if (held && !branch.valid(held)) return;

    if (!held && !evidence.current()) return onRefuse(SOURCE_EDITED);

    await keep({ kase, model, recording, held });
  };

  const finish = async () => {
    lease.cancel();

    if (finishing.current) return;

    finishing.current = true;

    try {
      await score();
    } catch (e) {
      onRefuse(errorMessage(e));
    } finally {
      branch.clear();
      evidence.clear();
      sim.drive.stop();
      setPhase('idle');
      finishing.current = false;
    }
  };

  const finishFromEffect = useEffectEvent(() => {
    void finish();
  });

  const running = phase === 'running';
  const seconds = branch.seconds ?? active?.task.seconds;
  const outOfTime = running && seconds !== undefined && elapsed >= seconds;
  const leftDrive = running && !sim.drive.active;

  useEffect(() => {
    if (!outOfTime && !leftDrive) return;

    const soon = setTimeout(finishFromEffect, 0);

    return () => clearTimeout(soon);
  }, [outOfTime, leftDrive]);

  const begin = async (all: boolean) => {
    if (!active || phase !== 'idle') return;

    evidence.begin();

    const staged = stageCase(active, { rig, parts }, partners());
    const kase = staged.kase;
    const ticket = lease.claimAfter(() => {
      if (staged.slots.length > 1) sim.setWorld(caseWorldItems(kase), staged.joined);
    });

    setPhase('starting');

    const logic = await caseLogicPlan(kase, { parts, joints, buildModel: sim.buildModel, skills: options.skills });

    if (!lease.current(ticket)) return;

    const refusal = logic.refusal ?? (await vision.prepare(logic.plan, ticket));

    if (!lease.current(ticket)) return;

    if (refusal) {
      vision.release();
      onRefuse(refusal);
      setPhase('idle');

      return;
    }

    const started = await sim.drive.start(teamFor(staged, { rig, parts }, all), {
      current: () => lease.current(ticket),
    });

    if (!lease.current(ticket)) return;

    if (!started) {
      vision.release();
      refuseDrive(sim.drive.refusal(), onRefuse);
      setPhase('idle');

      return;
    }

    setStartedAt(sim.latestStats()?.time ?? 0);
    scripted.current = all;
    sim.runCase({ kase, plan: logic.plan, joints, kit: logic.kit });
    sim.record();
    setPhase('running');
  };

  return {
    phase,
    elapsed,
    branching: branch.running,
    cancelBranch: branch.cancel,
    branch: branch.start,
    start: () => begin(false),
    reference: () => begin(true),
    end: () => void finish(),
  };
}
