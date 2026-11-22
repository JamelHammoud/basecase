import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';

export interface ControlDelayState {
  history: Float64Array[];
  next: number;
  count: number;
}

export class ControlDelay {
  private history: Float64Array[] = [];
  private next = 0;
  private count = 0;

  get steps() {
    return this.count;
  }

  reset(steps = 0) {
    this.count = steps;
    this.history = [];
    this.next = 0;
  }

  snapshot(): ControlDelayState {
    return { history: this.history.map((row) => row.slice()), next: this.next, count: this.count };
  }

  restore(state: ControlDelayState) {
    this.history = state.history.map((row) => row.slice());
    this.next = state.next;
    this.count = state.count;
  }

  apply(ctrl: Float64Array) {
    if (this.count <= 0 || Number.isNaN(this.count)) return;

    const slot = this.history[this.next];

    if (slot) slot.set(ctrl);

    if (!slot) this.history.push(Float64Array.from(ctrl));

    const capacity = this.count + 1;
    const oldest = this.history.length > this.count ? (this.next + 1) % capacity : 0;

    ctrl.set(this.history[oldest]);
    this.next = (this.next + 1) % capacity;
  }

  module(mj: MainModule): MainModule {
    const step = (model: MjModel, data: MjData) => {
      this.apply(data.ctrl);
      mj.mj_step(model, data);
    };

    return Object.create(mj, { mj_step: { value: step } }) as MainModule;
  }
}
