import type { SimEngine } from '../../sim/engine';
import type { SimJoint } from '../../sim/mjcfTypes';
import { RECORD_HZ, type Recording } from '../../sim/recorder';
import { RANGE_SLACK_DEG, type JointPairs } from './jointMatch';
import type { SourceEpisode } from './types';
import { toRadians, type ColumnSpan, type SourceUnit } from './units';

export interface ReplayPlan {
  joints: JointPairs;
  unit: SourceUnit;
  spans: ColumnSpan[];
}

interface Column {
  source: number;
  joint: SimJoint;
  qpos: number;
  dof: number;
  value: (v: number) => number;
  inRange: (q: number) => boolean;
}

const sceneUnit = (j: SimJoint) => (j.type === 'revolute' ? 180 / Math.PI : 1000);

function valueOf(joint: SimJoint, plan: ReplayPlan, span: ColumnSpan): (v: number) => number {
  if (joint.type === 'revolute') return (v) => toRadians(v, plan.unit);

  if (plan.unit === 'rad' || !joint.range || span.hi <= span.lo) return (v) => v;

  const [lo, hi] = joint.range.map((mm) => mm / 1000);

  return (v) => lo + ((v - span.lo) / (span.hi - span.lo)) * (hi - lo);
}

function rangeCheck(joint: SimJoint): (q: number) => boolean {
  if (!joint.range) return () => true;

  const slack = joint.type === 'revolute' ? RANGE_SLACK_DEG : 0.5;
  const [lo, hi] = joint.range;
  const scale = sceneUnit(joint);

  return (q) => q * scale >= lo - slack && q * scale <= hi + slack;
}

export function replayColumns(engine: SimEngine, plan: ReplayPlan): Column[] {
  const qpos = engine.jointAddresses();
  const dof = engine.dofAddresses();
  const index = new Map(engine.sim.joints.map((j, i) => [j.id, i]));

  return plan.joints.flatMap((id, source) => {
    const i = id === null ? undefined : index.get(id);

    if (i === undefined) return [];

    const joint = engine.sim.joints[i];

    return [
      {
        source,
        joint,
        qpos: qpos[i],
        dof: dof[i],
        value: valueOf(joint, plan, plan.spans[source]),
        inRange: rangeCheck(joint),
      },
    ];
  });
}

const frameStep = (t: Float64Array) => (t.length > 1 ? (t[t.length - 1] - t[0]) / (t.length - 1) : 1 / RECORD_HZ);

interface Buffers {
  qpos: Float64Array;
  qvel: Float32Array;
  ctrl: Float32Array;
  poses: Float32Array;
}

function buffersFor(engine: SimEngine, frames: number): Buffers {
  const { model } = engine;

  return {
    qpos: new Float64Array(frames * model.nq),
    qvel: new Float32Array(frames * model.nv),
    ctrl: new Float32Array(frames * model.nu),
    poses: new Float32Array(frames * engine.sim.bodies.length * 7),
  };
}

function setFrame(engine: SimEngine, columns: Column[], row: Float64Array) {
  const { data } = engine;
  let inRange = true;

  for (const c of columns) {
    const q = c.value(row[c.source]);

    data.qpos[c.qpos] = q;
    inRange &&= c.inRange(q);

    if (c.joint.actuator >= 0 && c.joint.drive === 'position') data.ctrl[c.joint.actuator] = q;
  }

  return inRange;
}

function velocities(out: Buffers, columns: Column[], at: { n: number; dt: number; nq: number; nv: number }) {
  if (at.n === 0 || at.dt <= 0) return;

  for (const c of columns) {
    const now = out.qpos[at.n * at.nq + c.qpos];
    const before = out.qpos[(at.n - 1) * at.nq + c.qpos];

    out.qvel[at.n * at.nv + c.dof] = (now - before) / at.dt;
  }
}

export interface Replayed {
  recording: Recording;
  outOfRange: number;
}

export function kinematicRecording(engine: SimEngine, episode: SourceEpisode, plan: ReplayPlan): Replayed {
  const { model, data } = engine;
  const frames = episode.t.length;
  const width = plan.joints.length;
  const columns = replayColumns(engine, plan);
  const out = buffersFor(engine, frames);
  const dt = frameStep(episode.t);
  const nbody = engine.sim.bodies.length;
  let outOfRange = 0;

  engine.reset();

  const rest = { qpos: Float64Array.from(data.qpos), ctrl: Float64Array.from(data.ctrl) };

  for (let n = 0; n < frames; n++) {
    data.qpos.set(rest.qpos);
    data.ctrl.set(rest.ctrl);

    if (!setFrame(engine, columns, episode.state.subarray(n * width, (n + 1) * width))) outOfRange++;

    engine.refreshKinematics();
    out.qpos.set(data.qpos, n * model.nq);
    out.ctrl.set(data.ctrl, n * model.nu);
    out.poses.set(engine.poses(), n * nbody * 7);
    velocities(out, columns, { n, dt, nq: model.nq, nv: model.nv });
  }

  const recording: Recording = {
    dt,
    frames,
    nq: model.nq,
    nv: model.nv,
    nu: model.nu,
    nbody,
    t: Float32Array.from(episode.t, (s) => s - episode.t[0]),
    ...out,
    jointQpos: engine.jointAddresses(),
    jointDof: engine.dofAddresses(),
    root: engine.rootAddresses(),
    faults: [],
  };

  return { recording, outOfRange };
}
