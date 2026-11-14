import type { DriveCommand } from './driveTypes';
import type { SimEngine } from './engine';
import { TorqueRecorder, type TorqueSeries } from '../utils/peakTorque';
import type { AmpModel } from '../utils/servoAmps';
import { demandedTorques, jointForces, jointSpeeds, limitForces } from './simForces';

export interface RunRequest {
  id: number;
  seconds: number;
  pushes?: Array<{ at: number; robot: string; force: [number, number, number] }>;
  frames?: number[];
  forceLimits?: Record<string, number>;
  trace?: boolean;
  currents?: Record<string, AmpModel>;
  commands?: Array<{ at: number; command: DriveCommand }>;
}

export interface RunResult {
  id: number;
  stats: ReturnType<SimEngine['stats']>;
  frames: Array<{ t: number; poses: Float64Array }>;
  trace?: TorqueSeries;
}

function applyDuePushes(sim: SimEngine, pushes: NonNullable<RunRequest['pushes']>, t: number) {
  while (pushes.length && pushes[0].at <= t + 1e-9) {
    const p = pushes.shift()!;

    sim.pushRobot(p.robot, p.force);
  }
}

export function applyDueCommands(sim: SimEngine, commands: NonNullable<RunRequest['commands']>, t: number) {
  while (commands.length && commands[0].at <= t + 1e-9) sim.command(commands.shift()!.command);
}

function tracer(sim: SimEngine, currents: Record<string, AmpModel> = {}) {
  const n = sim.sim.joints.length;
  const recorder = new TorqueRecorder(n, sim.dt, { amps: sim.sim.joints.map((j) => currents[j.id] ?? null) });
  const demand = new Float64Array(n);
  const actual = new Float64Array(n);
  const speed = new Float64Array(n);

  return {
    recorder,
    afterStep: () =>
      recorder.add(
        demandedTorques(sim.model, sim.data, sim.sim.joints, demand),
        jointForces(sim.data, sim.sim.joints, actual),
        jointSpeeds(sim.data, sim.sim.joints, speed),
      ),
  };
}

export function runFor(sim: SimEngine, msg: RunRequest): RunResult {
  const pushes = [...(msg.pushes ?? [])].sort((a, b) => a.at - b.at);
  const commands = [...(msg.commands ?? [])].sort((a, b) => a.at - b.at);
  const wanted = [...(msg.frames ?? [])].sort((a, b) => a - b);
  const frames: Array<{ t: number; poses: Float64Array }> = [];
  const start = sim.data.time;
  const end = start + msg.seconds;

  if (msg.forceLimits) limitForces(sim.model, sim.sim, msg.forceLimits);

  const trace = msg.trace ? tracer(sim, msg.currents) : null;

  while (sim.data.time < end - 1e-9) {
    const t = sim.data.time - start;

    applyDuePushes(sim, pushes, t);
    applyDueCommands(sim, commands, t);

    while (wanted.length && wanted[0] <= t + 1e-9) frames.push({ t: wanted.shift()!, poses: sim.poses() });

    sim.step(Math.min(0.02, end - sim.data.time), trace?.afterStep);
  }

  if (wanted.length) frames.push({ t: msg.seconds, poses: sim.poses() });

  return { id: msg.id, stats: sim.stats(), frames, trace: trace?.recorder.series() };
}
