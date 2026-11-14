import type { MainModule } from '@mujoco/mujoco';
import type { SimEngine } from './engine';
import type { Recording } from './recorder';

export const fitsRecording = (engine: SimEngine, r: Recording) =>
  r.nq === engine.model.nq && r.nv === engine.model.nv && r.nu === engine.model.nu && r.frames > 0;

const clampFrame = (r: Recording, frame: number) => Math.max(0, Math.min(r.frames - 1, Math.round(frame)));

function recordedCtrl(r: Recording, actuator: number, time: number): number {
  const last = r.frames - 1;
  const at = Math.max(0, Math.min(last, time / r.dt));
  const lo = Math.min(Math.floor(at), last);
  const hi = Math.min(lo + 1, last);
  const w = at - lo;

  return r.ctrl[lo * r.nu + actuator] * (1 - w) + r.ctrl[hi * r.nu + actuator] * w;
}

function primeRecordedHistory(mj: MainModule, engine: SimEngine, r: Recording) {
  const { model, data } = engine;
  const dt = model.opt.timestep;

  for (let a = 0; a < model.nu; a++) {
    const samples = model.actuator_history[a * 2];

    if (model.actuator_historyadr[a] < 0 || !samples) continue;

    const times = Array.from({ length: samples }, (_, k) => data.time - (samples - k) * dt);

    mj.mj_initCtrlHistory(
      model,
      data,
      a,
      times,
      times.map((t) => recordedCtrl(r, a, t)),
    );
  }
}

export function setRecordedFrame(mj: MainModule, engine: SimEngine, r: Recording, frame: number): number {
  const { model, data } = engine;
  const n = clampFrame(r, frame);

  data.time = n * r.dt;
  data.qpos.set(r.qpos.subarray(n * r.nq, (n + 1) * r.nq));
  data.qvel.set(r.qvel.subarray(n * r.nv, (n + 1) * r.nv));
  data.ctrl.set(r.ctrl.subarray(n * r.nu, (n + 1) * r.nu));
  primeRecordedHistory(mj, engine, r);
  mj.mj_forward(model, data);

  return n;
}

interface Scrubbed {
  mj: MainModule;
  engine: SimEngine;
  r: Recording;
}

function windowPeaks({ mj, engine, r }: Scrubbed, frame: number, out: Float64Array) {
  const { model, data, sim } = engine;
  const steps = frame === 0 ? 0 : Math.max(1, Math.round(r.dt / engine.dt));
  const keep = () =>
    sim.joints.forEach((j, i) => {
      const force = j.actuator < 0 ? 0 : data.actuator_force[j.actuator];

      if (Math.abs(force) > Math.abs(out[i])) out[i] = force;
    });

  out.fill(0);
  setRecordedFrame(mj, engine, r, frame - (steps ? 1 : 0));

  if (!steps) return keep();

  data.ctrl.set(r.ctrl.subarray(frame * r.nu, (frame + 1) * r.nu));

  for (let s = 0; s < steps; s++) {
    mj.mj_step(model, data);
    keep();
  }
}

export interface RecordedEfforts {
  peaks: Float32Array[];
  forces: Float32Array[];
}

export const effortsTransfer = (e: RecordedEfforts | null) => (e ? [...e.peaks, ...e.forces].map((a) => a.buffer) : []);

export function recordedEfforts(mj: MainModule, engine: SimEngine, r: Recording): RecordedEfforts {
  const joints = engine.sim.joints;
  const column = (j: (typeof joints)[number]) => new Float32Array(j.actuator < 0 ? 0 : r.frames);
  const efforts = { peaks: joints.map(column), forces: joints.map(column) };
  const peaks = new Float64Array(joints.length);
  const force = engine.data.actuator_force;

  for (let n = 0; n < r.frames; n++) {
    windowPeaks({ mj, engine, r }, n, peaks);
    joints.forEach((j, i) => {
      if (j.actuator < 0) return;

      efforts.peaks[i][n] = peaks[i];
      efforts.forces[i][n] = force[j.actuator];
    });
  }

  return efforts;
}
