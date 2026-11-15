import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameSetStore, MAX_FRAME_BLOB_BYTES, MAX_FRAME_MANIFEST_BYTES } from './frameSetStore.mjs';

let dir;
let store;
const manifest = (id = 'set-1') => ({ version: 1, id, name: 'Blocks', caseId: null, sceneId: null, seed: 1, classes: [], createdAt: 'now', frames: [{ id: 'f1', seed: 1, camera: 'camera', width: 1, height: 1, annotations: [] }] });
const save = () => {
  store.saveFrame({ id: 'set-1', frameId: 'f1', jpeg: new Uint8Array([255, 216, 255, 217]), depth: new Uint8Array(4) });
  store.saveManifest(manifest());
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-sets-'));
  store = new FrameSetStore({ dir: path.join(dir, 'frames') });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('FrameSetStore', () => {
  it('lists metadata and reads each frame separately without putting blobs in JSON', () => {
    save();
    expect(store.list()).toEqual([{ ...manifest(), frames: 1 }]);
    expect(store.manifest('set-1')).toEqual(manifest());
    expect(store.frame({ id: 'set-1', frameId: 'f1' }).jpeg).toEqual(new Uint8Array([255, 216, 255, 217]));
    expect(store.frame({ id: 'set-1', frameId: 'gone' })).toBeNull();
    expect(fs.readFileSync(path.join(dir, 'frames', 'set-1', 'manifest.json'), 'utf8')).not.toContain('jpeg');
  });

  it('reads an unchanged manifest once across repeated frame reads', () => {
    save();

    const read = vi.spyOn(fs, 'readFileSync');

    store.frame({ id: 'set-1', frameId: 'f1' });
    store.frame({ id: 'set-1', frameId: 'f1' });
    store.jpeg({ id: 'set-1', frameId: 'f1' });
    expect(read.mock.calls.filter(([file]) => String(file).endsWith('manifest.json'))).toHaveLength(1);
    read.mockRestore();
  });

  it('refuses hostile ids before touching any path', () => {
    save();

    for (const id of ['..', '../auth', '..\\auth', 'a/b', 'CON', '', 'x'.repeat(200), 7, null]) {
      expect(() => store.manifest(id)).toThrow('Not a valid id');
      expect(() => store.saveManifest(manifest(id))).toThrow('Not a valid id');
      expect(() => store.saveFrame({ id: 'set-1', frameId: id, jpeg: new Uint8Array(), depth: new Uint8Array() })).toThrow('Not a valid id');
      expect(() => store.frame({ id, frameId: 'f1' })).toThrow('Not a valid id');
    }

    expect(store.list()).toEqual([{ ...manifest(), frames: 1 }]);
  });

  it('bounds manifests and blobs and skips corrupt files on disk', () => {
    expect(() => store.saveManifest({ ...manifest(), name: 'a'.repeat(MAX_FRAME_MANIFEST_BYTES) })).toThrow();
    expect(() => store.saveFrame({ id: 'set-1', frameId: 'f1', jpeg: { byteLength: MAX_FRAME_BLOB_BYTES + 1 }, depth: new Uint8Array() })).toThrow();
    save();
    fs.writeFileSync(path.join(dir, 'frames', 'set-1', 'manifest.json'), '{');
    expect(store.list()).toEqual([]);
    expect(store.manifest('set-1')).toBeNull();
  });

  it('does not publish manifests with missing or mismatched depth data', () => {
    expect(() => store.saveManifest(manifest())).toThrow();
    save();
    expect(() => store.saveManifest({ ...manifest(), frames: [{ ...manifest().frames[0], width: 2 }] })).toThrow();
  });

  it('finalizes a staged run under its content id and checks both ids before copying', () => {
    save();
    store.finalize({ manifest: manifest('content-id'), sourceId: 'set-1' });
    expect(store.manifest('content-id')).toEqual(manifest('content-id'));
    expect(store.frame({ id: 'content-id', frameId: 'f1' }).depth).toEqual(new Uint8Array(4));
    expect(() => store.finalize({ manifest: manifest('../auth'), sourceId: 'set-1' })).toThrow();
    expect(() => store.finalize({ manifest: manifest('safe'), sourceId: '../auth' })).toThrow();
  });
});
