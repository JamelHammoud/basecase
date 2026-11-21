import { afterEach, expect, it, vi } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { createVisibilitySession } from './visibilityClient';
import type { StudyPacket } from './wire';

const messages: Array<{ id: number; op: string; payload: StudyPacket }> = [];

class CaptureWorker {
  onmessage: ((event: { data: { id: number; result: null } }) => void) | null = null;

  postMessage(message: (typeof messages)[number]) {
    messages.push(message);
    queueMicrotask(() => this.onmessage?.({ data: { id: message.id, result: null } }));
  }

  terminate() {}
}

afterEach(() => vi.unstubAllGlobals());

it('sends camera edits without engineering triangle, measure or mesh-file buffers', async () => {
  vi.stubGlobal('Worker', CaptureWorker);

  const session = createVisibilitySession();

  try {
    await session.measure({
      parts: [box('camera', [0, 0, 0], [10, 10, 10], 1)],
      project: DEFAULT_PROJECT,
      triangles: { expensive: new Float32Array(900000) },
      measures: {},
      meshFiles: { catalog: new ArrayBuffer(1024) },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].payload.assets.filter((asset) => asset.node.kind === 'binary')).toHaveLength(0);
    expect(JSON.stringify(messages[0].payload)).not.toContain('expensive');
    expect(JSON.stringify(messages[0].payload)).not.toContain('meshFiles');
  } finally {
    session.dispose();
  }
});
