import type { DriveCommand } from './driveTypes';
import type { Controller, SimEngine } from './engine';
import type { FaultKind, RecordedFault } from './faults';
import { torqueShare } from './torqueShare';
import type { WorldChange, WorldEvent } from '../cases/worldSet';
import type { WorldMoves } from './worldMoves';
import type { FactValue } from '../cases/caseFacts';
import type { IdealTendon } from '../types/tendon';
import { ContinuationCapture, type ContinuationCaptureOptions } from './continuationCapture';
import type { TeachingRecording } from './teachingRecording';
import type { AppliedOwner } from './teaching';
import type { ForceEvidence, ContactForces } from './contactForces';

export const RECORD_HZ = 50;

const MAX_SECONDS = 600;

export interface RecordedCommand {
  at: number;
  command: DriveCommand;
}

export interface RecordedInput {
  at: number;
  name: string;
  value: FactValue;
}

export interface Recording {
  teaching?: TeachingRecording;
  actionTime?: Float64Array;
  actionOwner?: Uint8Array;
  actionCtrl?: Float64Array;
  actionQpos?: Float64Array;
  actionQvel?: Float64Array;
  actionPrevious?: Float32Array;
  evaluation?: import('../cases/evaluationReplayValidation').EvaluationReplay;
  transmission?: {
    motors: Array<{ joint: string; actuator: number; tendon: IdealTendon }>;
    observations: Array<{ joint: string; qpos: number; dof: number }>;
    fingerprints: Record<string, string>;
  };
  timeOffset?: number;
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
  torque?: Float32Array;
  faults?: RecordedFault[];
  commands?: RecordedCommand[];
  controller?: Controller;
  world?: WorldEvent[];
  inputs?: RecordedInput[];
  topics?: Uint8Array;
  forceEvidence?: ForceEvidence;
  contactForce?: Float64Array;
  contactForcePeak?: Float64Array;
  contacts?: Int32Array;
  contactOffsets?: Int32Array;
  continuation?: Uint8Array;
}

class Growing<T extends Float32Array | Float64Array | Int32Array | Uint8Array> {
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
const i32 = (n: number) => new Int32Array(n);
const OWNER_CODE: Record<AppliedOwner, number> = { policy: 0, operator: 1, context: 2 };

export class Recorder {
  private readonly engine: SimEngine;

  readonly dt = 1 / RECORD_HZ;

  private next: number;

  private frames = 0;

  private readonly started: number;
  private readonly clock: number;

  private readonly t = new Growing(f32, 512);

  private readonly ctrl: Growing<Float32Array>;

  private readonly qpos: Growing<Float64Array>;

  private readonly qvel: Growing<Float32Array>;

  private readonly poses: Growing<Float32Array>;

  private readonly torque = new Growing(f32, 512);

  private readonly jointQpos: Int32Array;

  private readonly jointDof: Int32Array;

  private readonly root: [number, number];

  private readonly scan: Growing<Float32Array> | null;
  private readonly faults: RecordedFault[] = [];
  private readonly commands: RecordedCommand[] = [];
  private readonly world: WorldEvent[] = [];
  private readonly inputs: RecordedInput[] = [];
  private readonly controller: Controller | null;
  private readonly contacts = new Growing(i32, 512);
  private readonly contactOffsets = new Growing(i32, 512);
  private contactCount = 0;
  private readonly forceSource: ContactForces | null;
  private forceSourceCurrent = true;
  private readonly contactForce = new Growing(f64, 1);
  private readonly contactForcePeak = new Growing(f64, 1);
  private readonly continuation: ContinuationCapture | null;
  private sampledAt = -1;
  private teaching: TeachingRecording | null = null;
  private readonly actionTime = new Growing(f64, 1);
  private readonly actionOwner = new Growing((n) => new Uint8Array(n), 1);
  private readonly actionCtrl = new Growing(f64, 1);
  private readonly actionQpos = new Growing(f64, 1);
  private readonly actionQvel = new Growing(f64, 1);
  private readonly actionPrevious = new Growing(f32, 1);

  constructor(
    engine: SimEngine,
    controller: Controller | null = null,
    world: WorldMoves | null = null,
    options?: ContinuationCaptureOptions | { clock: number },
  ) {
    const { model } = engine;

    this.engine = engine;
    this.forceSource = engine.forces;
    this.started = engine.data.time;
    this.clock = options && 'clock' in options ? options.clock : this.started;
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
    this.continuation = options && 'caseHash' in options ? new ContinuationCapture(engine, options) : null;

    for (const c of engine.givenCommands()) this.commands.push({ at: 0, command: structuredClone(c) });

    for (const j of engine.stats().joints) if (j.fault) this.faults.push({ joint: j.id, kind: j.fault, at: 0 });

    for (const change of world?.state() ?? []) this.world.push({ ...structuredClone(change), at: 0 });

    this.sample();
    this.continuationHook();
  }

  readonly continuationHook = () => {
    if (this.sampledAt !== this.engine.data.time) return;

    this.continuation?.capture(this.frames - 1, {
      commands: this.commands.length,
      faults: this.faults.length,
      world: this.world.length,
      inputs: this.inputs.length,
    });
  };

  invalidateContinuation() {
    this.continuation?.invalidate();
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

  readonly worldChange = (change: WorldChange) => {
    this.world.push({ ...structuredClone(change), at: this.engine.data.time - this.started });
  };

  readonly input = (name: string, value: FactValue) => {
    this.inputs.push({ at: this.engine.data.time - this.started, name, value });
  };

  readonly control = (owner?: AppliedOwner) => {
    const session = this.engine.teachingSource();
    const { data } = this.engine;
    const at = data.time - this.started;

    if (!session || at >= MAX_SECONDS) return;

    owner ??= session.owner;
    this.teaching ??= { ...structuredClone(session.source), boundaries: 0, ownership: [] };

    if (this.teaching.policy !== session.source.policy) throw new Error('Keep one source policy in a teaching try.');

    this.teaching.boundaries++;

    const last = this.teaching.ownership!.at(-1);

    if (last?.owner === owner) last.until = at + this.engine.dt;
    else this.teaching.ownership!.push({ owner, at, until: at + this.engine.dt });

    this.actionTime.push([at]);
    this.actionOwner.push([OWNER_CODE[owner]]);
    this.actionCtrl.push(data.ctrl);
    this.actionQpos.push(data.qpos);
    this.actionQvel.push(data.qvel);
    this.actionPrevious.push(session.previous);
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
    this.sampledAt = data.time;

    this.t.push([data.time - this.clock]);
    this.ctrl.push(data.ctrl);
    this.qpos.push(data.qpos);
    this.qvel.push(data.qvel);
    this.poses.push(this.engine.poses());
    this.torque.push([torqueShare(this.engine)]);
    this.contactOffsets.push([this.contactCount]);

    const contacts = this.engine.contactPairs();

    this.contacts.push(contacts);
    this.contactCount += contacts.length;

    this.forceSourceCurrent &&= this.forceSource === this.engine.forces;

    if (this.forceSource && this.forceSourceCurrent) {
      this.contactForce.push(this.forceSource.values);
      this.contactForcePeak.push(this.forceSource.peaks);
    }

    if (this.scan && this.engine.scanner) {
      this.engine.scanner.tick();
      this.scan.push(this.engine.scanner.values);
    }

    this.frames++;
    this.next += this.dt;
  }

  private recordedForces(): Pick<Recording, 'forceEvidence' | 'contactForce' | 'contactForcePeak'> {
    if (!this.forceSource || !this.forceSourceCurrent) return {};

    return {
      forceEvidence: structuredClone(this.forceSource.evidence),
      contactForce: this.contactForce.done(),
      contactForcePeak: this.contactForcePeak.done(),
    };
  }

  finish(): Recording {
    this.forceSourceCurrent &&= this.forceSource === this.engine.forces;

    if (this.engine.forces && this.sampledAt < this.engine.data.time) this.sample();

    const { model } = this.engine;
    const motors = this.engine.sim.joints.flatMap((joint) =>
      joint.tendon ? [{ joint: joint.id, actuator: joint.actuator, tendon: structuredClone(joint.tendon) }] : [],
    );
    const transmission = motors.length
      ? {
          motors,
          observations: this.engine.sim.joints.map((joint, i) => ({
            joint: joint.id,
            qpos: this.jointQpos[i],
            dof: this.jointDof[i],
          })),
          fingerprints: Object.fromEntries(this.engine.sim.robots.map((robot) => [robot.key, robot.fingerprint])),
        }
      : undefined;

    return {
      ...(this.teaching
        ? {
            teaching: structuredClone(this.teaching),
            actionTime: this.actionTime.done(),
            actionOwner: this.actionOwner.done(),
            actionCtrl: this.actionCtrl.done(),
            actionQpos: this.actionQpos.done(),
            actionQvel: this.actionQvel.done(),
            actionPrevious: this.actionPrevious.done(),
          }
        : {}),
      ...(transmission ? { transmission } : {}),
      ...(this.started !== this.clock ? { timeOffset: this.started - this.clock } : {}),
      ...this.recordedForces(),
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
      torque: this.torque.done(),
      jointQpos: this.jointQpos,
      jointDof: this.jointDof,
      root: this.root,
      contacts: this.contacts.done(),
      contactOffsets: Int32Array.from([...this.contactOffsets.done(), this.contactCount]),
      ...(this.continuation ? { continuation: this.continuation.finish() } : {}),
      ...(this.scan && this.engine.scanner
        ? { scan: this.scan.done(), scanWidth: this.engine.scanner.values.length }
        : {}),
      faults: this.faults,
      ...(this.controller ? { commands: this.commands, controller: this.controller } : {}),
      ...(this.world.length ? { world: this.world } : {}),
      ...(this.inputs.length ? { inputs: this.inputs } : {}),
    };
  }
}

export const recordingTransfer = (r: Recording): Transferable[] =>
  [
    r.t,
    r.ctrl,
    r.qpos,
    r.qvel,
    r.poses,
    r.torque,
    r.jointQpos,
    r.jointDof,
    r.scan,
    r.topics,
    r.contacts,
    r.contactForce,
    r.contactForcePeak,
    r.contactOffsets,
    r.continuation,
    r.actionTime,
    r.actionOwner,
    r.actionCtrl,
    r.actionQpos,
    r.actionQvel,
    r.actionPrevious,
  ].flatMap((a) => (a ? [a.buffer] : []));

export function framePoses(r: Recording, frame: number): Float64Array {
  const size = r.nbody * 7;
  const at = Math.max(0, Math.min(r.frames - 1, frame)) * size;

  return Float64Array.from(r.poses.subarray(at, at + size));
}

export function frameContacts(r: Recording, frame: number): Int32Array {
  if (!r.contacts || !r.contactOffsets) return new Int32Array();

  const at = Math.max(0, Math.min(r.frames - 1, frame));

  return r.contacts.subarray(r.contactOffsets[at], r.contactOffsets[at + 1]);
}
