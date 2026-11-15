import loadMujoco from '@mujoco/mujoco';
import { expect, it, vi } from 'vitest';
import { SimEngine } from './engine';
import { contactSliders } from './fixtures/contactRobots';
import { frameContacts, Recorder } from './recorder';
import type { SimRequest, SimResponse } from './sim.worker';

it('posts saved contact evidence when seeking and no evidence for legacy recordings', async () => {
  const mj = await loadMujoco();
  const model = contactSliders();
  const engine = new SimEngine(mj, model);
  const recorder = new Recorder(engine);
  const replies: SimResponse[] = [];
  const scope = {
    onmessage: null as ((event: { data: SimRequest }) => Promise<void>) | null,
    postMessage: (message: SimResponse, transfer: Transferable[]) =>
      replies.push(structuredClone(message, { transfer })),
  };
  const send = async (data: SimRequest) => {
    replies.length = 0;
    await scope.onmessage!({ data: structuredClone(data) });
    expect(replies.filter((reply) => reply.type === 'error')).toEqual([]);
  };

  vi.stubGlobal('self', scope);

  try {
    await import('./sim.worker');
    engine.stepHook = recorder.hook;
    engine.step(0.04);

    const recording = recorder.finish();
    const empty = {
      ...recording,
      contacts: new Int32Array(),
      contactOffsets: new Int32Array(recording.frames + 1),
    };
    const legacy = { ...recording, contacts: undefined, contactOffsets: undefined };

    expect(frameContacts(recording, 0).length).toBeGreaterThan(0);
    await send({ type: 'load', model });

    for (const kept of [recording, empty, legacy]) {
      await send({ type: 'scrub', recording: kept, efforts: { peaks: [], forces: [] } });

      for (const frame of [0, recording.frames - 1, 0]) {
        await send({ type: 'seek', frame });

        const shown = replies.find((reply) => reply.type === 'frame');

        expect(shown?.contacts).toEqual(frameContacts(kept, frame));
      }
    }

    expect(recording.contacts!.byteLength).toBeGreaterThan(0);
  } finally {
    await scope.onmessage?.({ data: { type: 'dispose' } });
    engine.dispose();
    vi.unstubAllGlobals();
  }
});
