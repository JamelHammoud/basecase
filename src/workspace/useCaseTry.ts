import { useRef, useState } from 'react';
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
import { startCaseTeaching } from './caseTeaching';
import type { ActionOwner } from '../sim/teaching';
import { useCaseHandoff } from './useCaseHandoff';
import { useFinishTry } from './useTryCompletion';

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
  teach?: () => Promise<void>;
  owner?: ActionOwner | null;
  handoff?: () => Promise<void>;
}

const MIN_FRAMES = 2;

const TOO_SHORT = 'Play the simulation to record a try.';

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

interface TryContext {
  recordId?: number;
  kase: Case;
  model: SimModel;
  scene: { rig: Rig; parts: ScenePart[] };
  partners: SlotRobot[];
  onTry: TryOptions['onTry'];
}

interface TeachingAttempt {
  kase: Case;
  model: SimModel;
  logic: Awaited<ReturnType<typeof caseLogicPlan>>;
  ticket: number;
}

const teachingRefusal = (teaching: boolean, plan: TeachingAttempt['logic']['plan']) =>
  teaching && plan ? 'Choose a Case without controller logic.' : null;

interface ScoringAttempt {
  options: TryOptions;
  context: TryContext | null;
  branch: ReturnType<typeof useCaseBranch>;
  scripted: boolean;
  release: () => void;
}

async function keepCaseAttempt(input: ScoringAttempt, recording: Recording, held: BranchTryContext | null) {
  const { options, context, branch } = input;
  const source = held?.scoring ?? context ?? { kase: options.active, model: options.sim.model };

  if (!source.kase || !source.model) return;

  const record = await caseTryRecord({
    kase: source.kase,
    model: source.model,
    recording,
    scene: context
      ? { ...context.scene, partners: context.partners }
      : { rig: options.rig, parts: options.parts, partners: options.partners() },
    branch: held,
  });

  if (held && !branch.valid(held)) return;

  if (held && options.onBranchTry) return options.onBranchTry(record, recording, () => branch.valid(held));

  await (context?.onTry ?? options.onTry)(record, recording, input.scripted ? 'script' : null);
}

async function scoreCaseAttempt(input: ScoringAttempt) {
  const { sim, onRefuse } = input.options;
  const held = input.branch.context();

  if (held) sim.pause();

  const recording = await sim.stopRecording(input.context?.recordId);

  input.release();
  sim.runCase(null);

  if (!recording) return;

  if (recording.frames < MIN_FRAMES) return onRefuse(TOO_SHORT);

  if (held && !input.branch.valid(held)) return;

  await keepCaseAttempt(input, recording, held);
}

export function useCaseTry(options: TryOptions): CaseTry {
  const { sim, rig, parts, joints, active, partners, onTry, onRefuse } = options;
  const [phase, setPhase] = useState<TryPhase>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const branch = useCaseBranch({ sim, scope: options.branchScope ?? options.scope, setPhase, setStartedAt, onRefuse });
  const finishing = useRef(false);
  const scripted = useRef(false);
  const { owner, setOwner, handoff, fail } = useCaseHandoff({ sim, phase, finishing, onRefuse, setPhase });
  const saved = useRef<TryContext | null>(null);
  const lease = useStartupLease(options.scope, sim.subscribeStop, () =>
    setPhase((value) => (value === 'starting' ? 'idle' : value)),
  );
  const vision = useCaseVision(lease);
  const elapsed = phase === 'running' ? Math.max(0, (sim.stats?.time ?? 0) - startedAt) : 0;

  const score = () =>
    scoreCaseAttempt({
      options,
      context: saved.current,
      branch,
      scripted: scripted.current,
      release: () => {
        vision.release();
        setPhase('scoring');
      },
    });

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
      sim.drive.stop();
      saved.current = null;
      setOwner(null);
      setPhase('idle');
      finishing.current = false;
    }
  };

  useFinishTry({
    sim,
    phase,
    recordId: () => saved.current?.recordId,
    seconds: branch.seconds ?? active?.task.seconds,
    elapsed,
    finish,
  });

  const beginTeaching = async (input: TeachingAttempt) => {
    const { kase, model, logic, ticket } = input;
    const reply = await startCaseTeaching({
      scene: { model, kase, rig, parts, skills: options.skills },
      sim,
      current: () => lease.current(ticket),
      logic,
      joints,
    });

    if (reply && saved.current) saved.current.recordId = reply.id;

    if (!lease.current(ticket) || !reply?.owner) return finish();

    setStartedAt(reply.startedAt);
    setOwner(reply.owner);
    setPhase('running');
  };

  const begin = async (all: boolean, teaching = false) => {
    if (!active || phase !== 'idle') return;

    const staged = stageCase(active, { rig, parts }, partners());
    const kase = staged.kase;
    const ticket = lease.claimAfter(() => {
      if (staged.slots.length > 1) sim.setWorld(caseWorldItems(kase), staged.joined);
    });

    setPhase('starting');

    const logic = await caseLogicPlan(kase, { parts, joints, buildModel: sim.buildModel, skills: options.skills });

    if (!lease.current(ticket)) return;

    const refusal =
      logic.refusal ?? teachingRefusal(teaching, logic.plan) ?? (await vision.prepare(logic.plan, ticket));

    if (!lease.current(ticket)) return;

    if (refusal) {
      vision.release();
      onRefuse(refusal);
      setPhase('idle');

      return;
    }

    const started = await sim.drive.start(teamFor(staged, { rig, parts }, all), {
      current: () => lease.current(ticket),
      inPlace: teaching,
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

    const model = sim.modelNow();

    if (!model) return;

    saved.current = { kase: active, model, scene: { rig, parts }, partners: partners(), onTry };

    if (teaching) return beginTeaching({ kase, model, logic, ticket });

    sim.runCase({ kase, plan: logic.plan, joints, kit: logic.kit });
    sim.record();
    setPhase('running');
  };

  const teach = () => begin(false, true).catch(fail);

  return {
    phase,
    elapsed,
    branching: branch.running,
    cancelBranch: branch.cancel,
    branch: branch.start,
    start: () => begin(false),
    reference: () => begin(true),
    end: () => void finish(),
    teach,
    owner,
    handoff,
  };
}
