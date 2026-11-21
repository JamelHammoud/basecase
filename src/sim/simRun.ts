import type { DriveCommand } from './driveTypes';
import type { LiveCase } from '../cases/liveCase';
import type { SimEngine } from './engine';
import { TorqueRecorder, type TorqueSeries } from '../utils/peakTorque';
import type { AmpModel } from '../utils/servoAmps';
import { demandedTorques, jointForces, jointSpeeds, limitForces } from './simForces';
import { TimelineCursor } from '../utils/timelineCursor';

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

export const commandTimeline = (sim: SimEngine, commands: NonNullable<RunRequest['commands']>) =>
  new TimelineCursor(
    commands,
    (c) => c.at,
    (c) => sim.command(c.command),
  );

export interface ScriptTimeline {
  start: number;
  commands: ReturnType<typeof commandTimeline>;
}

export function stepScriptedCase(engine: SimEngine, live: LiveCase, script: ScriptTimeline | null, seconds: number) {
  live.advance(seconds, () => script?.commands.advance(engine.data.time - script.start));
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
  const frames: Array<{ t: number; poses: Float64Array }> = [];
  const pushes = new TimelineCursor(
    msg.pushes ?? [],
    (p) => p.at,
    (p) => sim.pushRobot(p.robot, p.force),
  );
  const commands = commandTimeline(sim, msg.commands ?? []);
  const wanted = new TimelineCursor(
    msg.frames ?? [],
    (t) => t,
    (t) => frames.push({ t, poses: sim.poses() }),
  );
  const start = sim.data.time;
  const end = start + msg.seconds;

  if (msg.forceLimits) limitForces(sim.model, sim.sim, msg.forceLimits);

  const trace = msg.trace ? tracer(sim, msg.currents) : null;

  while (sim.data.time < end - 1e-9) {
    const t = sim.data.time - start;

    pushes.advance(t);
    commands.advance(t);
    wanted.advance(t);

    sim.step(Math.min(0.02, end - sim.data.time), trace?.afterStep);
  }

  if (wanted.remaining) frames.push({ t: msg.seconds, poses: sim.poses() });

  return { id: msg.id, stats: sim.stats(), frames, trace: trace?.recorder.series() };
}
