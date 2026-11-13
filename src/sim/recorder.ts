import type { DriveCommand } from './driveTypes';
import type { Controller, SimEngine } from './engine';
import type { FaultKind, RecordedFault } from './faults';

export const RECORD_HZ = 50;

const MAX_SECONDS = 600;

export interface RecordedCommand {
  at: number;
  command: DriveCommand;
}

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
  jointDof?: Int32Array;
  root?: [number, number];
  scan?: Float32Array;
  scanWidth?: number;
  faults?: RecordedFault[];
  commands?: RecordedCommand[];
  controller?: Controller;
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

  readonly dt = 1 / RECORD_HZ;

  private next: number;

  private frames = 0;

  private readonly started: number;

  private readonly t = new Growing(f32, 512);

  private readonly ctrl: Growing<Float32Array>;

  private readonly qpos: Growing<Float64Array>;

  private readonly qvel: Growing<Float32Array>;

  private readonly poses: Growing<Float32Array>;

  private readonly jointQpos: Int32Array;

  private readonly jointDof: Int32Array;

  private readonly root: [number, number];

  private readonly scan: Growing<Float32Array> | null;
  private readonly faults: RecordedFault[] = [];
  private readonly commands: RecordedCommand[] = [];
  private readonly controller: Controller | null;

  constructor(engine: SimEngine, controller: Controller | null = null) {
    const { model } = engine;

    this.engine = engine;
    this.started = engine.data.time;
    this.next = this.started;
    this.ctrl = new Growing(f32, 512 * model.nu);
    this.qpos = new Growing(f64, 512 * model.nq);
    this.qvel = new Growing(f32, 512 * model.nv);
    this.poses = new Growing(f32, 512 * engine.sim.bodies.length * 7);
    this.jointQpos = engine.jointAddresses();
    this.jointDof = engine.dofAddresses();
    this.root = engine.rootAddresses();
    this.scan = engine.scanner ? new Growing(f32, 512 * engine.scanner.values.length) : null;
    this.controller = controller;

    for (const c of engine.givenCommands()) this.commands.push({ at: 0, command: structuredClone(c) });

    for (const j of engine.stats().joints) if (j.fault) this.faults.push({ joint: j.id, kind: j.fault, at: 0 });

    this.sample();
  }

  fault(joint: string, kind: FaultKind | null) {
    const at = this.engine.data.time - this.started;
    const open = this.faults.find((f) => f.joint === joint && f.until === undefined);

    if (open) open.until = at;

    if (kind) this.faults.push({ joint, kind, at });
  }

  readonly command = (c: DriveCommand) => {
    this.commands.push({ at: this.engine.data.time - this.started, command: structuredClone(c) });
  };

  get length() {
    return this.frames;
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
      jointDof: this.jointDof,
      root: this.root,
      ...(this.scan && this.engine.scanner
        ? { scan: this.scan.done(), scanWidth: this.engine.scanner.values.length }
        : {}),
      faults: this.faults,
      ...(this.controller ? { commands: this.commands, controller: this.controller } : {}),
    };
  }
}

export const recordingTransfer = (r: Recording): Transferable[] =>
  [r.t, r.ctrl, r.qpos, r.qvel, r.poses, r.jointQpos, r.jointDof, r.scan].flatMap((a) => (a ? [a.buffer] : []));

export function framePoses(r: Recording, frame: number): Float64Array {
  const size = r.nbody * 7;
  const at = Math.max(0, Math.min(r.frames - 1, frame)) * size;

  return Float64Array.from(r.poses.subarray(at, at + size));
}
