import { describe, expect, it } from 'vitest';
import { depthBytes, hashFrame, hashFrameSet, readDepth, readFrameSet, serializeFrameSet } from './frameSet';
import { visionFixture } from './fixtures';

describe('vision frame content', () => {
  it('keeps the exact little endian bytes of offset depth views', () => {
    const source = new Float32Array([99, 1.5, -0, 100]);
    const view = source.subarray(1, 3);
    const bytes = depthBytes(view);

    expect([...bytes]).toEqual([0, 0, 192, 63, 0, 0, 0, 128]);
    expect(readDepth(bytes)).toEqual(view);
    expect(new Uint32Array(readDepth(bytes).buffer)[1]).toBe(0x80000000);
  });

  it('round trips JPEG and every float depth byte through JSON', () => {
    const set = visionFixture();
    const restored = readFrameSet(serializeFrameSet(set));

    expect(restored).toEqual(set);
    expect(restored?.frames[0].image).toBeInstanceOf(Uint8Array);
    expect(restored?.frames[0].depth).toBeInstanceOf(Float32Array);
  });

  it('hashes binary content and metadata with stable property order and without its own id', () => {
    const set = visionFixture();
    const frame = set.frames[0];

    expect(hashFrame({ ...frame, id: 'another' })).toBe(frame.id);
    expect(hashFrame({ ...frame, seed: frame.seed + 1 })).not.toBe(frame.id);
    expect(hashFrame({ ...frame, image: new Uint8Array([1, 2, 4]) })).not.toBe(frame.id);
    expect(hashFrame({ ...frame, depth: new Float32Array(12).fill(9) })).not.toBe(frame.id);
    expect(hashFrame({ ...frame, camera: { ...frame.camera, label: 'Other' } })).not.toBe(frame.id);
    expect(hashFrameSet({ ...set, id: 'another' })).toBe(set.id);
    expect(hashFrameSet({ ...set, name: 'Other' })).not.toBe(set.id);
    expect(hashFrameSet({ ...set, frames: [{ ...frame, image: new Uint8Array([0]) }] })).not.toBe(set.id);
    expect(hashFrame(Object.fromEntries(Object.entries(frame).reverse()) as typeof frame)).toBe(frame.id);
  });

  it('refuses corrupted ids, binary lengths and class references', () => {
    const set = visionFixture();

    expect(readFrameSet('{')).toBeNull();
    expect(readFrameSet(serializeFrameSet({ ...set, id: '0'.repeat(64) }))).toBeNull();
    expect(
      readFrameSet(serializeFrameSet({ ...set, frames: [{ ...set.frames[0], depth: new Float32Array(1) }] })),
    ).toBeNull();
    expect(readFrameSet(serializeFrameSet({ ...set, classes: [] }))).toBeNull();
  });
});
