import type { SimResponse } from './sim.worker';
import type { Plan } from '../routines/planTypes';
import { planVisionSources } from '../routines/visionSources';
import { liveModelErrors, modelLoadErrors, RoutineModelError } from '../routines/liveModels';
import { startVision } from '../vision/client';

export class VisionLink {
  private stops: (() => void)[] = [];
  private ticket = 0;

  async start(plan: Plan): Promise<boolean> {
    this.stop();

    const errors = liveModelErrors(plan);

    if (errors.length) throw new RoutineModelError(errors);

    const ticket = this.ticket;
    const opened: (() => void)[] = [];

    try {
      for (const source of planVisionSources(plan)) {
        const stop = await startVision(source.camera, source.model).catch((reason: unknown) => {
          throw new RoutineModelError(modelLoadErrors(plan, source.model, reason));
        });

        opened.push(stop);

        if (ticket !== this.ticket) {
          opened.forEach((release) => release());

          return false;
        }
      }

      if (ticket !== this.ticket) opened.forEach((stop) => stop());
      else this.stops = opened;

      return ticket === this.ticket;
    } catch (reason) {
      opened.forEach((stop) => stop());

      throw reason;
    }
  }

  note(msg: SimResponse) {
    if (msg.type === 'routine' && msg.done) this.stop();
  }

  stop() {
    this.ticket++;
    this.stops.forEach((stop) => stop());
    this.stops = [];
  }
}
