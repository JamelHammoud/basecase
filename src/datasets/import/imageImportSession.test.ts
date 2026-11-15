import { describe, expect, it } from 'vitest';
import { frameSetHash, type FrameSet } from '../../vision/frameSet';
import { ImageImportSession } from './imageImportSession';

const fixture = (): FrameSet => ({
  version: 1,
  id: 'source',
  name: 'Blocks',
  caseId: null,
  sceneId: null,
  seed: 1,
  classes: [],
  createdAt: '1970-01-01T00:00:00.000Z',
  frames: ['original', 'duplicate'].map((id) => ({
    id,
    seed: 1,
    camera: 'import',
    width: 1,
    height: 1,
    jpeg: new Uint8Array([255, 216, 255, 217]),
    depth: new Float32Array([0]),
    annotations: [],
    split: 'train',
  })),
});

describe('preparing imported image identities', () => {
  it('deduplicates content without mutating source frames and keeps hashes consistent', async () => {
    const session = new ImageImportSession();
    const set = fixture();
    const before = Date.now();

    session.load(set);

    const prepared = await session.prepare({ caseId: null, sceneId: null, objects: [] });
    const frame = session.take();

    expect(set.frames.map((source) => source.id)).toEqual(['original', 'duplicate']);
    expect(prepared.manifest.frames).toHaveLength(1);
    expect(frame.id).toBe(prepared.manifest.frames[0].id);
    expect(prepared.hash).toBe(await frameSetHash({ ...prepared.manifest, frames: [frame] }));
    expect(prepared.manifest.id).toBe(`frames-${prepared.hash}`);
    expect(Date.parse(prepared.manifest.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(prepared.manifest.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(() => session.take()).toThrow('Import the files again.');
  });
});
