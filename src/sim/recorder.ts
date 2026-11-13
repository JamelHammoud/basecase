import type { SimEngine } from './engine';

export const RECORD_HZ = 50;

const MAX_SECONDS = 600;

export interface Recording {
  dt: number;
  frames: number;
  nq: number;
  nv: number;
  nu: number;
  nbody: number;
  t: Float32Array;
  ctrl: Float32Array;
  qpos: Float64Array;
  qvel: Float32Array;
  poses: Float32Array;
  jointQpos?: Int32Array;
  scan?: Float32Array;
  scanWidth?: number;
}

class Growing<T extends Float32Array | Float64Array> {
  private data: T;

  private used = 0;

  private readonly make: (n: number) => T;

  constructor(make: (n: number) => T, start: number) {
    this.make = make;
    this.data = make(Math.max(start, 1));
  }

  push(values: ArrayLike<number>) {
    if (this.used + values.length > this.data.length) {
      const next = this.make(Math.max(this.data.length * 2, this.used + values.length));

      next.set(this.data);
      this.data = next;
    }

    this.data.set(values, this.used);
    this.used += values.length;
  }

  done(): T {
    return this.data.slice(0, this.used) as T;
  }
}

const f32 = (n: number) => new Float32Array(n);
const f64 = (n: number) => new Float64Array(n);

export class Recorder {
  private readonly engine: SimEngine;

  private readonly dt = 1 / RECORD_HZ;

  private next: number;

  private frames = 0;

  private readonly started: number;

  private readonly t = new Growing(f32, 512);

  private readonly ctrl: Growing<Float32Array>;

  private readonly qpos: Growing<Float64Array>;

  private readonly qvel: Growing<Float32Array>;

  private readonly poses: Growing<Float32Array>;

  private readonly jointQpos: Int32Array;

  private readonly scan: Growing<Float32Array> | null;

  constructor(engine: SimEngine) {
    const { model } = engine;

    this.engine = engine;
    this.started = engine.data.time;
    this.next = this.started;
    this.ctrl = new Growing(f32, 512 * model.nu);
    this.qpos = new Growing(f64, 512 * model.nq);
    this.qvel = new Growing(f32, 512 * model.nv);
    this.poses = new Growing(f32, 512 * engine.sim.bodies.length * 7);
    this.jointQpos = engine.jointAddresses();
    this.scan = engine.scanner ? new Growing(f32, 512 * engine.scanner.values.length) : null;
    this.sample();
  }

  readonly hook = () => {
    if (this.engine.data.time + 1e-9 < this.next || this.frames >= MAX_SECONDS * RECORD_HZ) return;

    this.sample();
  };

  private sample() {
    const { data } = this.engine;

    this.engine.refreshKinematics();

    this.t.push([data.time - this.started]);
    this.ctrl.push(data.ctrl);
    this.qpos.push(data.qpos);
    this.qvel.push(data.qvel);
    this.poses.push(this.engine.poses());

    if (this.scan && this.engine.scanner) {
      this.engine.scanner.tick();
      this.scan.push(this.engine.scanner.values);
    }

    this.frames++;
    this.next += this.dt;
  }

  finish(): Recording {
    const { model } = this.engine;

    return {
      dt: this.dt,
      frames: this.frames,
      nq: model.nq,
      nv: model.nv,
      nu: model.nu,
      nbody: this.engine.sim.bodies.length,
      t: this.t.done(),
      ctrl: this.ctrl.done(),
      qpos: this.qpos.done(),
      qvel: this.qvel.done(),
      poses: this.poses.done(),
      jointQpos: this.jointQpos,
      ...(this.scan && this.engine.scanner
        ? { scan: this.scan.done(), scanWidth: this.engine.scanner.values.length }
        : {}),
    };
  }
}

export const recordingTransfer = (r: Recording): Transferable[] =>
  [r.t, r.ctrl, r.qpos, r.qvel, r.poses, r.jointQpos, r.scan].flatMap((a) => (a ? [a.buffer] : []));

export function framePoses(r: Recording, frame: number): Float64Array {
  const size = r.nbody * 7;
  const at = Math.max(0, Math.min(r.frames - 1, frame)) * size;

  return Float64Array.from(r.poses.subarray(at, at + size));
}
