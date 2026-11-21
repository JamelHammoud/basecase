import type { RunIntent } from './runBuffer';
import type { RobotControl, RobotEvent, RobotState, RobotStatus } from './robotState';
import { robotBenchDriving, robotSceneJoints, robotSnapshot, sendUnitCommand, setBenchDriving } from './robotStore';
import { subscribeUnitCommands } from './unitCommandEvents';
import { subscribeUnitRobot } from './unitSubscription';

export const BENCH_INTENT_MS = 25;
export const BENCH_TELEMETRY_MS = 300;

export type BenchEnd = 'completed' | 'cancelled' | 'stale' | 'fault' | 'telemetry' | 'command-refused' | 'storage';

interface BenchExecutionInput {
  unit: string;
  begun: RobotState;
  seconds: number;
  target: (seconds: number) => number[];
  running: (state: RobotState) => boolean;
  hear: (status: RobotStatus, heardS: number) => boolean;
  accepted?: (intent: RunIntent) => void;
  validStatus?: (status: RobotStatus) => boolean;
  signal?: AbortSignal;
  current?: () => boolean;
  strict?: boolean;
  returnToStart?: number[];
  control?: RobotControl;
}

class BenchExecution {
  private readonly input: BenchExecutionInput;
  private readonly resolve: (kind: BenchEnd) => void;
  private readonly started = performance.now();
  private readonly joints: string | undefined;
  private readonly owner = Symbol();
  private lastStatus: RobotStatus | null;
  private heardAt = this.started;
  private pending = false;
  private finalSent = false;
  private done = false;
  private unsubscribe = () => {};
  private uncommand = () => {};
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(input: BenchExecutionInput, resolve: (kind: BenchEnd) => void) {
    this.input = input;
    this.resolve = resolve;
    this.joints = robotSceneJoints(input.unit)?.join('\0');
    this.lastStatus = input.begun.status;
  }

  start() {
    this.unsubscribe = subscribeUnitRobot(this.input.unit, (event) => this.guard(() => this.onState(event)));
    this.uncommand = subscribeUnitCommands((event) => {
      if (event.unit === this.input.unit && event.owner !== this.owner) this.finish('cancelled');
    });
    this.input.signal?.addEventListener('abort', this.abort, { once: true });
    this.timer = setInterval(() => this.guard(() => this.tick()), BENCH_INTENT_MS);

    if (this.input.strict) this.guard(() => this.tick());
  }

  private readonly abort = () => this.finish('cancelled');

  private sameConnection() {
    const state = robotSnapshot(this.input.unit);

    return state.link === 'connected' && state.spec === this.input.begun.spec;
  }

  private currentBindings() {
    try {
      return (
        this.sameConnection() &&
        robotSnapshot(this.input.unit).calibration === this.input.begun.calibration &&
        robotSceneJoints(this.input.unit)?.join('\0') === this.joints &&
        (this.input.current?.() ?? true)
      );
    } catch {
      return false;
    }
  }

  private guard(action: () => void) {
    try {
      action();
    } catch {
      this.finish('fault');
    }
  }

  private send(command: Record<string, unknown>) {
    const bound = this.input.control ? { ...command, control: this.input.control } : command;

    return sendUnitCommand(this.input.unit, bound, this.owner);
  }

  private finish(kind: BenchEnd, stop = true) {
    if (this.done) return;

    this.done = true;
    clearInterval(this.timer);
    this.unsubscribe();
    this.uncommand();
    this.input.signal?.removeEventListener('abort', this.abort);
    setBenchDriving(false, this.input.unit);

    if (stop && this.sameConnection()) void this.send({ cmd: 'stop' }).catch(() => {});

    if (kind === 'completed' && this.input.returnToStart && this.currentBindings())
      void this.send({ cmd: 'intent', joints: this.input.returnToStart }).catch(() => {});

    this.resolve(kind);
  }

  private async intent(seconds: number) {
    this.pending = true;

    const at = performance.now() - this.started;

    try {
      const values = this.input.target(seconds);
      const reply = await this.send({ cmd: 'intent', joints: values });

      if (this.done) return;

      if (!reply.ok) return this.finish('command-refused');

      this.input.accepted?.({ at, joints: [...values] });
      this.finalSent = seconds >= this.input.seconds;
    } catch {
      this.finish('command-refused');
    } finally {
      this.pending = false;
    }
  }

  private tick() {
    if (this.done) return;

    if (!this.currentBindings()) return this.finish('stale');

    if (!this.input.running(robotSnapshot(this.input.unit))) return this.finish('fault');

    const seconds = (performance.now() - this.started) / 1000;

    if (this.input.strict && performance.now() - this.heardAt > BENCH_TELEMETRY_MS) return this.finish('telemetry');

    if (seconds >= this.input.seconds + 1) return this.finish(this.input.strict ? 'telemetry' : 'completed', false);

    if (this.input.control && seconds >= this.input.seconds) return;

    if (!this.pending && !this.finalSent) void this.intent(Math.min(seconds, this.input.seconds));
  }

  private onState(event: RobotEvent) {
    if (this.done) return;

    if (event.event === 'link') return this.finish('stale', false);

    if (this.endedControl(event)) return;

    if (event.event === 'calibration') return this.finish('stale');

    if (['fault', 'stopped'].includes(event.event)) return this.finish('fault', false);

    if (!this.currentBindings()) return this.finish('stale');

    const state = robotSnapshot(this.input.unit);

    if (!this.input.running(state)) return this.finish('fault', false);

    this.receiveStatus(state);
  }

  private endedControl(event: RobotEvent): boolean {
    if (event.event !== 'control' || event.connection !== this.input.control?.connection || event.held !== false)
      return false;

    this.finish(controlCompletion(event.completion), false);

    return true;
  }

  private receiveStatus(state: RobotState) {
    if (!state.status || state.status === this.lastStatus) return;

    this.lastStatus = state.status;
    this.heardAt = performance.now();

    const complete = this.input.hear(this.lastStatus, (this.heardAt - this.started) / 1000);

    if (this.input.validStatus && !this.input.validStatus(this.lastStatus)) return this.finish('telemetry');

    if (complete && (!this.input.strict || this.finalSent)) this.finish('completed', false);
  }
}

function controlCompletion(value: unknown): BenchEnd {
  if (value === 'completed') return 'completed';

  return value === 'storage' ? 'storage' : 'cancelled';
}

export function executeBench(input: BenchExecutionInput): Promise<BenchEnd> | null {
  if (robotBenchDriving(input.unit) || input.signal?.aborted || !input.running(input.begun)) return null;

  setBenchDriving(true, input.unit);

  return new Promise((resolve) => new BenchExecution(input, resolve).start());
}
