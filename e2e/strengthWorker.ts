import type { Page } from 'playwright-core';
import type { AnalyzePayload } from '../src/three/analysis/analysisOps';
import type { StrengthReading } from '../src/strength/types';
import { L_BRACKET, ON_ITS_SIDE } from '../src/strength/fixtures/lBracket';

export async function stubBracketStrength(page: Page) {
  await page.evaluate(
    ({ part, down }) => {
      const postMessage = Worker.prototype.postMessage;
      const listening = new WeakSet<Worker>();
      const pending = new WeakMap<Worker, Map<number, StrengthReading[]>>();

      Worker.prototype.postMessage = function (
        message: unknown,
        transfer?: Transferable[] | StructuredSerializeOptions,
      ) {
        const options = Array.isArray(transfer) ? { transfer } : transfer;
        const request = message as { id: number; op: string; payload?: AnalyzePayload };
        const task = request.payload?.task;

        if (request.op !== 'analyze' || task?.kind !== 'strength' || task.jobs.some((job) => job.part !== part)) {
          return postMessage.call(this, message, options);
        }

        if (!listening.has(this)) {
          const onmessage = this.onmessage;

          listening.add(this);
          pending.set(this, new Map());
          this.onmessage = (event: MessageEvent<{ id: number }>) => {
            const result = pending.get(this)?.get(event.data.id);

            if (!result) return onmessage?.call(this, event);

            pending.get(this)!.delete(event.data.id);

            const data = 'error' in event.data ? event.data : { id: event.data.id, result };

            onmessage?.call(this, new MessageEvent('message', { data }));
          };
        }

        const readings = task.jobs.map((job): StrengthReading => ({
          key: job.key,
          part: job.part,
          factor: job.down?.every((value, axis) => value === down[axis]) ? 3 : 1,
          down: job.down!,
          best: { down, factor: 3 },
          worst: [0, 0, 0],
          cells: 0,
          ms: 0,
          field: { origin: [0, 0, 0], h: [1, 1, 1], n: [0, 0, 0], cells: new Int32Array(), ratio: new Float32Array() },
        }));

        pending.get(this)!.set(request.id, readings);
        postMessage.call(this, { ...request, payload: { ...request.payload, task: { ...task, jobs: [] } } }, options);
      };
    },
    { part: L_BRACKET, down: ON_ITS_SIDE },
  );
}
