import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SceneLibrary } from './sceneLibrary.mjs';

let dir;
let library;

const part = (id, extra = {}) => ({ id, kind: 'box', ...extra });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenes-'));
  library = new SceneLibrary({ scenesDir: dir, cacheFile: path.join(dir, '..', `${path.basename(dir)}.cache.json`) });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('SceneLibrary', () => {
  it('lists light summaries and loads the full record on demand', () => {
    library.save({
      id: 'robot',
      name: 'Robot',
      parts: [part('a'), part('b', { kind: 'component' }), part('c', { hardware: { type: 'nut' } })],
      annotations: [{ id: 'n1' }],
      referenceImages: [{ dataUrl: 'x'.repeat(1000) }],
      previewDataUrl: 'data:image/webp;base64,AAA',
      sizeMm: [10, 20, 30],
    });

    const [summary] = library.list();

    expect(summary).toMatchObject({
      id: 'robot',
      name: 'Robot',
      partCount: 3,
      catalogCount: 2,
      commentCount: 1,
      previewDataUrl: 'data:image/webp;base64,AAA',
      sizeMm: [10, 20, 30],
    });
    expect(summary).not.toHaveProperty('parts');
    expect(summary).not.toHaveProperty('referenceImages');
    expect(library.get('robot').parts).toHaveLength(3);
    expect(library.get('robot')).not.toHaveProperty('referenceImages');
  });

  it('picks up files changed outside the library and forgets deleted ones', () => {
    library.save({ id: 'a', name: 'A', parts: [] });
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ id: 'b', name: 'B', parts: [part('x')] }));

    expect(library.list().map((s) => s.id).sort()).toEqual(['a', 'b']);

    expect(library.delete('a').map((s) => s.id)).toEqual(['b']);
  });

  it('adds a preview without touching the save time', () => {
    const saved = library.save({ id: 'p', name: 'P', parts: [part('a')] });
    const updated = library.savePreview({ id: 'p', previewDataUrl: 'data:x', sizeMm: [1, 2, 3] });

    expect(updated.updatedAt).toBe(saved.updatedAt);
    expect(library.list()[0].previewDataUrl).toBe('data:x');
  });

  it('keeps the preview across autosaves and drops autosaves of a deleted scene', () => {
    library.save({ id: 'auto', name: 'Auto', parts: [part('a')], previewDataUrl: 'data:p', sizeMm: [1, 2, 3] });
    library.save({ id: 'auto', name: 'Auto', parts: [part('a'), part('b')], chatId: 'chat-1', autosave: true });

    expect(library.list()[0]).toMatchObject({ partCount: 2, previewDataUrl: 'data:p', sizeMm: [1, 2, 3] });
    expect(library.get('auto').chatId).toBe('chat-1');

    library.delete('auto');

    expect(library.save({ id: 'auto', name: 'Auto', parts: [], autosave: true })).toBeNull();
    expect(library.list()).toEqual([]);
  });

  it('reports a changed list only for changes it did not write itself', () => {
    library.save({ id: 'a', name: 'A', parts: [] });

    expect(library.changedList()).toBeNull();

    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ id: 'b', name: 'B', parts: [] }));

    expect(library.changedList()?.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });
});
