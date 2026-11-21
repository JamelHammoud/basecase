import { keepTyped } from '../cases/recordingValues';
import type { SimEngine } from './engine';
import { CONTINUATION_MAX_BYTES, CONTINUATION_MAX_POINTS, type ContinuationCheckpoint } from './continuationFile';
import { readEngineContinuation } from './continuationStateReader';
import type { WorldMoves } from './worldMoves';

export interface ContinuationCaptureOptions {
  caseHash: string;
  seconds: number;
  deadline?: number;
  world: WorldMoves;
  physics: () => ContinuationCheckpoint['physics'];
}

export class ContinuationCapture {
  private readonly engine: SimEngine;
  private readonly options: ContinuationCaptureOptions;
  private readonly prefix: Uint8Array;
  private readonly started: number;
  private readonly deadline: number;
  private readonly points: Uint8Array[] = [];
  private bytes = 0;
  private invalidated = false;

  constructor(engine: SimEngine, options: ContinuationCaptureOptions) {
    this.engine = engine;
    this.options = options;
    this.started = engine.data.time;
    this.deadline = options.deadline ?? this.started + options.seconds;
    this.prefix = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        caseHash: options.caseHash,
        started: this.started,
        deadline: this.deadline,
      }).slice(0, -1) + ',"checkpoints":[',
    );
  }

  capture(frame: number, cursors: ContinuationCheckpoint['cursors']) {
    if (this.invalidated || frame % 50 !== 0 || this.engine.data.time > this.deadline + 1e-9) return;

    const engine = this.engine.continuation.capture();

    if (!engine || !readEngineContinuation(engine)) return this.invalidate();

    const checkpoint: ContinuationCheckpoint = {
      frame,
      time: this.engine.data.time - this.started,
      engine,
      world: this.options.world.snapshot(),
      physics: this.options.physics(),
      cursors,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(checkpoint, keepTyped));

    if (bytes.byteLength + this.prefix.byteLength + 2 > CONTINUATION_MAX_BYTES) return this.invalidate();

    this.points.push(bytes);
    this.bytes += bytes.byteLength;

    while (this.points.length > CONTINUATION_MAX_POINTS || this.size > CONTINUATION_MAX_BYTES)
      this.bytes -= this.points.shift()!.byteLength;
  }

  private get size() {
    return this.prefix.byteLength + this.bytes + Math.max(0, this.points.length - 1) + 2;
  }

  invalidate() {
    this.invalidated = true;
    this.points.length = 0;
    this.bytes = 0;
  }

  finish(): Uint8Array | undefined {
    if (!this.points.length || this.invalidated) return undefined;

    const out = new Uint8Array(this.size);
    let at = this.prefix.byteLength;

    out.set(this.prefix);

    for (const [i, point] of this.points.entries()) {
      if (i) out[at++] = 44;

      out.set(point, at);
      at += point.byteLength;
    }

    out.set([93, 125], at);

    return out;
  }
}
