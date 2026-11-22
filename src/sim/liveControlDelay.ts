import type { MainModule } from '@mujoco/mujoco';
import { ControlDelay, type ControlDelayState } from './controlDelay';
import { captureControl, type ControlledModule, type ControlStep } from './controlStep';
import type { ActionOwner, TeachingControl } from './teaching';

export type { ControlDelayState } from './controlDelay';

export class LiveControlDelay extends ControlDelay {
  private cursor = 0;
  private filled = 0;
  private owners: Array<ActionOwner | undefined> = [];
  private sessions: Array<TeachingControl | undefined> = [];

  reset(steps = 0) {
    super.reset(steps);
    this.cursor = 0;
    this.filled = 0;
    this.owners = [];
    this.sessions = [];
  }

  restore(state: ControlDelayState) {
    super.restore(state);
    this.cursor = state.next;
    this.filled = state.history.length;
    this.owners = [];
    this.sessions = [];
  }

  apply(ctrl: Float64Array, session?: TeachingControl) {
    const owner = session?.owner;

    if (this.steps <= 0 || Number.isNaN(this.steps)) return owner;

    if (session || this.sessions.length) {
      this.owners[this.cursor] = owner;
      this.sessions[this.cursor] = session;
    }

    super.apply(ctrl);

    const capacity = this.steps + 1;

    this.filled = Math.min(capacity, this.filled + 1);

    const oldest = this.filled > this.steps ? (this.cursor + 1) % capacity : 0;

    this.cursor = (this.cursor + 1) % capacity;

    return this.sessions[oldest] === session ? this.owners[oldest] : undefined;
  }

  module(mj: MainModule): ControlledModule {
    const stepControlled = (input: ControlStep) => {
      const owner = this.apply(input.data.ctrl, input.teaching ?? undefined);

      captureControl(input, owner ?? 'context');
      mj.mj_step(input.model, input.data);
    };

    return Object.create(super.module(mj), { stepControlled: { value: stepControlled } }) as ControlledModule;
  }
}
