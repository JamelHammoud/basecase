import type { MainModule } from '@mujoco/mujoco';
import type { DriveSetup } from '../sim/drive';
import type { DriveCommand } from '../sim/driveTypes';
import type { SimEngine } from '../sim/engine';
import type { FaultKind, RecordedFault } from '../sim/faults';
import type { SimModel } from '../sim/mjcfTypes';
import { Recorder, type Recording } from '../sim/recorder';
import { COMMAND_WIDTH, readCommand } from '../sim/recordedCommands';
import type { Randomization } from '../skills/environment';
import type { Rig } from '../utils/kinematics';
import { CASE_RANDOMIZATION } from './caseRandom';
import type { EndEffector } from './robotFit';
import { startEngine } from './runCase';
import type { Case } from './schema';
import { scoreTry } from './tries';
import { movedModel, placeStart, shiftedCommand, variedWorld, type MovedObject } from './variedWorld';

export const MULTIPLY_COUNT = 50;

export const MULTIPLY_BATCH = 5;

export interface MultiplyJob {
  model: SimModel;
  kase: Case;
  source: Recording;
  rig: Rig;
  effector: EndEffector | null;
  effectors?: Record<string, EndEffector | null>;
  randomization?: Randomization;
}

export interface Variation {
  seed: number;
  passed: boolean;
  margin: number;
  recording: Recording;
}

interface FaultEvent {
  at: number;
  joint: string;
  kind: FaultKind | null;
}

const faultEvents = (faults: RecordedFault[] = []): FaultEvent[] =>
  faults
    .flatMap((f) => [
      { at: f.at, joint: f.joint, kind: f.kind },
      ...(f.until === undefined ? [] : [{ at: f.until, joint: f.joint, kind: null }]),
    ])
    .sort((a, b) => a.at - b.at);

const sameCommand = (a: DriveCommand | undefined, b: DriveCommand) => JSON.stringify(a) === JSON.stringify(b);

interface Player {
  engine: SimEngine;
  source: Recording;
  moved: MovedObject[];
  sent: DriveCommand[];
}

function reachOf(setup: DriveSetup | undefined, slot: number): number {
  const own = setup?.kind === 'team' ? setup.members.find((m) => m.slot === slot)?.setup : setup;

  return own?.kind === 'arm' ? own.reachMm : 0;
}

function sendFrame({ engine, source, moved, sent }: Player, frame: number) {
  const slots = source.commandSlots ?? 0;

  for (let slot = 0; slot < slots; slot++) {
    const row = readCommand(source.commands!, (frame * slots + slot) * COMMAND_WIDTH);
    const reachMm = reachOf(source.drive, slot);
    const { v, target, aux } = shiftedCommand(row, { source, frame, moved, reachMm });
    const command: DriveCommand = { ...(slot ? { slot } : {}), v, ...(target ? { target } : {}), aux };

    if (sameCommand(sent[slot], command)) continue;

    sent[slot] = command;
    engine.command(command);
  }
}

function applyFaults(engine: SimEngine, events: FaultEvent[], at: { t: number; recorder?: Recorder }) {
  while (events.length && events[0].at <= at.t + 1e-9) {
    const e = events.shift()!;

    engine.setFault(e.joint, e.kind);
    at.recorder?.fault(e.joint, e.kind);
  }
}

export const canReplay = (r: Recording) => !!r.drive && !!r.commands && (r.commandSlots ?? 0) > 0;

export async function replayTry(mj: MainModule, job: MultiplyJob, seed: number | null): Promise<Variation> {
  const { source } = job;

  const world = variedWorld(job.model, job.kase, seed);
  const options = seed === null ? {} : { seed, randomization: job.randomization ?? CASE_RANDOMIZATION };
  const { engine, dispose } = startEngine(mj, job.model, {
    controller: { kind: 'drive', setup: source.drive! },
    options,
  });

  try {
    placeStart(mj, engine, source, world.moved);

    const events = faultEvents(source.faults);

    applyFaults(engine, events, { t: 0 });

    const recorder = new Recorder(engine);
    const player: Player = { engine, source, moved: world.moved, sent: [] };
    const start = engine.data.time;

    engine.stepHook = recorder.hook;

    for (let guard = 0; recorder.count < source.frames && guard < source.frames * 2; guard++) {
      sendFrame(player, Math.min(recorder.count, source.frames - 1));
      engine.step(source.dt);
      applyFaults(engine, events, { t: engine.data.time - start, recorder });
    }

    const recording = recorder.finish();
    const verdict = await scoreTry({
      kase: world.kase,
      model: movedModel(job.model, world.moved),
      recording,
      rig: job.rig,
      effector: job.effector,
      effectors: job.effectors,
    });

    return { seed: seed ?? 0, passed: verdict.passed, margin: verdict.margin, recording };
  } finally {
    engine.stepHook = null;
    dispose();
  }
}

export async function multiplyBatch(mj: MainModule, job: MultiplyJob, seeds: number[]): Promise<Variation[]> {
  const kept: Variation[] = [];

  for (const seed of seeds) {
    const variation = await replayTry(mj, job, seed);

    if (variation.passed) kept.push(variation);
  }

  return kept;
}

export function multiplySeeds(after: number, count: number, batch = MULTIPLY_BATCH): number[][] {
  const seeds = Array.from({ length: count }, (_, i) => after + i + 1);

  return Array.from({ length: Math.ceil(count / batch) }, (_, i) => seeds.slice(i * batch, (i + 1) * batch));
}
