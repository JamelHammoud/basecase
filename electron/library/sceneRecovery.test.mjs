import { captureVersion, emptyVersionGraph, readVersionGraph, restoreVersion } from '../../src/workspace/sceneVersions';
import { versionPart, versionScene } from '../../src/workspace/sceneVersions.fixtures';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SceneLibrary } from './sceneLibrary.mjs';

let folder;
let options;

beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-recovery-'));
  options = { scenesDir: folder, cacheFile: path.join(folder, '.summaries.json') };
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(folder, { recursive: true, force: true });
});

it('keeps the last complete scene when replacement is interrupted before rename', () => {
  const library = new SceneLibrary(options);
  const original = { id: 'rover', name: 'Rover', parts: [{ id: 'chassis', kind: 'box' }] };

  library.save(original);

  const saved = library.get('rover');
  const summary = library.list();
  const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
    throw new Error('Interrupted before scene replacement');
  });

  expect(() => library.save({ ...original, parts: [] })).toThrow('Interrupted before scene replacement');
  expect(library.get('rover')).toEqual(saved);
  expect(library.list()).toEqual(summary);
  expect(new SceneLibrary(options).get('rover')).toEqual(saved);
  expect(new SceneLibrary(options).list()).toEqual(summary);

  rename.mockRestore();
  library.save({ ...original, parts: [] });

  expect(new SceneLibrary(options).get('rover').parts).toEqual([]);
});

it('ignores unfinished scene files and checks the id before writing', () => {
  const library = new SceneLibrary(options);

  fs.writeFileSync(path.join(folder, 'rover.json.123.tmp'), '{"parts":[');

  expect(library.list()).toEqual([]);
  expect(() => library.save({ id: '../escape', name: 'Rover', parts: [] })).toThrow();
  expect(fs.readdirSync(folder)).toEqual(['rover.json.123.tmp']);
});


it('reopens a versioned rover and refuses malformed history without replacing its scene', () => {
  const library = new SceneLibrary(options);
  const original = versionScene([versionPart('rover')]);
  const graph = captureVersion(emptyVersionGraph(), original, { label: 'Rover baseline', at: '2026-11-16' });
  const history = JSON.stringify(graph);

  library.save({ ...original, id: 'rover', name: 'Rover', history });

  const loaded = new SceneLibrary(options).get('rover');

  expect(restoreVersion(readVersionGraph(loaded.history))).toEqual(original);
  expect(library.list()[0]).not.toHaveProperty('history');
  expect(() => library.save({ ...loaded, history: {} })).toThrow();
  expect(new SceneLibrary(options).get('rover')).toEqual(loaded);
});

it('shares part content across branch records and measures incremental history growth', () => {
  const library = new SceneLibrary(options);
  const parts = Array.from({ length: 1000 }, (_, index) => versionPart(`shared-${index}`));
  const baseline = versionScene(parts);
  const started = performance.now();
  const graph = captureVersion(emptyVersionGraph(), baseline, { label: 'Shared baseline', at: '2026-11-16' });

  library.save({ ...baseline, id: 'source', name: 'Source', history: JSON.stringify(graph) });

  const initialMs = performance.now() - started;
  const historyFolder = path.join(folder, '.history');
  const bytes = () => fs.readdirSync(historyFolder).reduce((sum, name) => sum + fs.statSync(path.join(historyFolder, name)).size, 0);
  const initialBytes = bytes();
  const initialFiles = fs.readdirSync(historyFolder).length;

  library.save({ ...baseline, id: 'branch', name: 'Branch', history: JSON.stringify(graph) });

  expect(bytes()).toBe(initialBytes);
  expect(fs.readdirSync(historyFolder)).toHaveLength(initialFiles);

  const editStarted = performance.now();
  const edited = versionScene([versionPart('shared-0', 10), ...parts.slice(1)]);
  const changed = captureVersion(graph, edited, { label: 'One edit', at: '2026-11-16' });

  library.save({ ...edited, id: 'branch', name: 'Branch', history: JSON.stringify(changed) });

  const editMs = performance.now() - editStarted;
  const editedBytes = bytes();

  expect(fs.readdirSync(historyFolder)).toHaveLength(initialFiles + 3);
  expect(restoreVersion(readVersionGraph(new SceneLibrary(options).get('source').history))).toEqual(baseline);
  expect(restoreVersion(readVersionGraph(new SceneLibrary(options).get('branch').history))).toEqual(edited);
  console.info(JSON.stringify({ parts: parts.length, initialMs, editMs, initialBytes, editedBytes, initialFiles }));
});

it('refuses forged hash paths and corrupted immutable history blocks', () => {
  const library = new SceneLibrary(options);
  const original = versionScene([versionPart('arm')]);
  const graph = captureVersion(emptyVersionGraph(), original, { label: 'Arm', at: '2026-11-16' });

  library.save({ ...original, id: 'arm', name: 'Arm', history: JSON.stringify(graph) });

  const raw = library.raw('arm');
  const historyFolder = path.join(folder, '.history');
  const key = Object.keys(graph.content)[0];

  fs.writeFileSync(path.join(historyFolder, key), 'changed');

  expect(new SceneLibrary(options).get('arm')).toBeNull();
  fs.writeFileSync(path.join(folder, 'arm.json'), JSON.stringify({ ...raw, historyRef: '../escape' }));

  expect(new SceneLibrary(options).get('arm')).toBeNull();
});

it('keeps the old version reference when final publication is interrupted after writing new content', () => {
  const library = new SceneLibrary(options);
  const original = versionScene([versionPart('rover')]);
  const graph = captureVersion(emptyVersionGraph(), original, { label: 'Before edit', at: '2026-11-16' });

  library.save({ ...original, id: 'rover', name: 'Rover', history: JSON.stringify(graph) });

  const before = library.get('rover');
  const next = captureVersion(graph, versionScene([versionPart('rover', 12)]), { label: 'After edit', at: '2026-11-16' });
  const rename = fs.renameSync.bind(fs);
  const finalFile = path.join(folder, 'rover.json');

  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === finalFile) throw new Error('Interrupted reference publication');

    return rename(from, to);
  });

  expect(() => library.save({ ...original, id: 'rover', name: 'Rover', history: JSON.stringify(next) })).toThrow();
  expect(new SceneLibrary(options).get('rover')).toEqual(before);
});

it('leaves legacy scenes without history content until a checkpoint is made', () => {
  const library = new SceneLibrary(options);

  library.save({ id: 'legacy', name: 'Legacy', parts: [] });
  library.get('legacy');
  library.list();

  expect(fs.existsSync(path.join(folder, '.history'))).toBe(false);
});
