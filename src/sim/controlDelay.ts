import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import { captureControl, type ControlledModule, type ControlStep } from './controlStep';
import type { ActionOwner, TeachingControl } from './teaching';

export interface ControlDelayState {
  history: Float64Array[];
  next: number;
  count: number;
}

export class ControlDelay {
  private history: Float64Array[] = [];
  private next = 0;
  private count = 0;
  private owners: Array<ActionOwner | undefined> = [];
  private sessions: Array<TeachingControl | undefined> = [];

  get steps() {
    return this.count;
  }

  reset(steps = 0) {
    this.count = steps;
    this.history = [];
    this.owners = [];
    this.sessions = [];
    this.next = 0;
  }

  snapshot(): ControlDelayState {
    return { history: this.history.map((row) => row.slice()), next: this.next, count: this.count };
  }

  restore(state: ControlDelayState) {
    this.history = state.history.map((row) => row.slice());
    this.owners = [];
    this.sessions = [];
    this.next = state.next;
    this.count = state.count;
  }

  apply(ctrl: Float64Array, session?: TeachingControl) {
    const owner = session?.owner;

    if (this.count <= 0 || Number.isNaN(this.count)) return owner;

    const slot = this.history[this.next];

    if (slot) slot.set(ctrl);

    if (!slot) this.history.push(Float64Array.from(ctrl));

    if (session || this.sessions.length) {
      this.owners[this.next] = owner;
      this.sessions[this.next] = session;
    }

    const capacity = this.count + 1;
    const oldest = this.history.length > this.count ? (this.next + 1) % capacity : 0;

    ctrl.set(this.history[oldest]);
    this.next = (this.next + 1) % capacity;

    return this.sessions[oldest] === session ? this.owners[oldest] : undefined;
  }

  module(mj: MainModule): ControlledModule {
    const step = (model: MjModel, data: MjData) => {
      this.apply(data.ctrl);
      mj.mj_step(model, data);
    };
    const stepControlled = (input: ControlStep) => {
      const owner = this.apply(input.data.ctrl, input.teaching ?? undefined);

      captureControl(input, owner ?? 'context');
      mj.mj_step(input.model, input.data);
    };

    return Object.create(mj, {
      mj_step: { value: step },
      stepControlled: { value: stepControlled },
    }) as ControlledModule;
  }
}
