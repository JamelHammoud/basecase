import { encodeRecording } from '../cases/recordingFile';
import { branchRecording } from '../cases/branchRecording';
import { caseSlots, type Case } from '../cases/schema';
import type { TryBranch } from '../cases/tryBranch';
import { keepTyped } from '../cases/recordingValues';
import { sha256Hex } from '../skills/hash';
import { applyContinuationEvent, continuationEvents } from './continuationEvents';
import { readContinuation, type ContinuationCheckpoint, type ContinuationRecording } from './continuationFile';
import type { Controller, SimEngine } from './engine';
import type { LivePhysics } from './livePhysics';
import { Recorder, type Recording } from './recorder';
import { fitsRecording } from './recordedFrames';
import type { WorldMoves } from './worldMoves';

export interface ContinuationPoint {
  frame: number;
  time: number;
  checkpoint: string;
}

export interface ContinuationTakeover {
  branch: TryBranch;
  started: number;
  deadline: number;
  controller: Controller;
}

interface Takeover {
  selection: number;
  frame: number;
  kase: Case;
  engine: SimEngine;
  world: WorldMoves;
  physics: LivePhysics;
  bytes?: Uint8Array;
}

function supported(kase: Case): boolean {
  return (
    !kase.logic &&
    caseSlots(kase).length === 1 &&
    !kase.console?.input.includes('code') &&
    !kase.console?.panels.some((panel) => panel.kind === 'code')
  );
}

function runtimeFits(engine: SimEngine, source: Recording, point: ContinuationCheckpoint): boolean {
  return (
    fitsRecording(engine, source) &&
    source.nbody === engine.sim.bodies.length &&
    point.engine.controller.kind === 'drive' &&
    engine.continuation.accepts(point.engine) &&
    point.physics.delay.history.every((row) => row.length === engine.model.nu)
  );
}

export class ContinuationSession {
  private selection = 0;
  private sourceHash: string | null = null;
  private source: Recording | null = null;
  private retained: ContinuationRecording | null = null;
  private summaries: ContinuationPoint[] = [];
  private active: { engine: SimEngine; recorder: Recorder; frame: number; time: number; deadline: number } | null =
    null;

  select(source: Recording | null): number {
    this.cancel();
    this.selection++;
    this.source = source;
    this.sourceHash = source?.continuation ? sha256Hex(encodeRecording(source)) : null;
    this.retained = source?.continuation ? readContinuation(source.continuation) : null;
    this.summaries =
      this.retained?.checkpoints.flatMap((point) =>
        source &&
        point.engine.controller.kind === 'drive' &&
        point.engine.integration[0] < this.retained!.deadline - 1e-9 &&
        point.frame < source.frames &&
        Math.abs(source.t[point.frame] - point.time) < 1e-4
          ? [{ frame: point.frame, time: point.time, checkpoint: sha256Hex(JSON.stringify(point, keepTyped)) }]
          : [],
      ) ?? [];

    return this.selection;
  }

  points(): ContinuationPoint[] {
    return structuredClone(this.summaries);
  }

  start(input: Takeover): ContinuationTakeover | null {
    const { selection, frame, kase, engine, world, physics } = input;
    const retained = this.retained;
    const source = this.source;
    const point = retained?.checkpoints.find((p) => p.frame === frame);
    const summary = this.summaries.find((p) => p.frame === frame);

    if (this.active || selection !== this.selection || !retained || !source || !point || !summary) return null;

    if (input.bytes && sha256Hex(input.bytes) !== this.sourceHash) return null;

    if (!supported(kase) || sha256Hex(JSON.stringify(kase)) !== retained.caseHash) return null;

    if (!runtimeFits(engine, source, point)) return null;

    const events = continuationEvents(source, point, engine);

    if (!events) return null;

    world.restore(point.world);
    engine.continuation.restore(point.engine);
    physics.restore(point.physics);

    const recorder = new Recorder(engine, source.controller ?? null, world, { clock: retained.started });
    let cursor = 0;

    engine.stepHook = recorder.hook;
    engine.commandHook = recorder.command;
    engine.continuationHook = null;
    engine.beforeStepHook = () => {
      const time = engine.data.time - retained.started;

      while (cursor < events.length && events[cursor].at <= time + 1e-9)
        applyContinuationEvent(events[cursor++], { engine, world, recorder });
    };
    this.active = { engine, recorder, frame, time: point.time, deadline: retained.deadline };

    return {
      branch: { version: 1, checkpoint: summary.checkpoint, frame, time: point.time },
      started: retained.started,
      deadline: retained.deadline,
      controller: structuredClone(point.engine.controller),
    };
  }

  recorderNow(): Recorder | null {
    return this.active?.recorder ?? null;
  }

  remaining(): number | null {
    return this.active ? Math.max(0, this.active.deadline - this.active.engine.data.time) : null;
  }

  finish(): Recording | null {
    const active = this.active;
    const source = this.source;

    if (!active || !source) return null;

    const suffix = active.recorder.finish();

    const recording = branchRecording({ source, checkpoint: active, suffix });

    this.select(null);

    return recording;
  }

  cancel() {
    if (!this.active) return;

    const { engine } = this.active;

    engine.beforeStepHook = null;
    engine.stepHook = null;
    engine.commandHook = null;
    engine.continuationHook = null;
    this.active = null;
  }
}
