import { describe, expect, it } from 'vitest';
import { parseQuery } from './queryParser';
import { graspMotion, storedTry, walkMotion, waveMotion } from './fixtures/searchFixtures';
import { TrySearchIndex } from './searchIndex';
import type { StoredTry, TrySource } from '../tryFile';
import type { TrySegment } from './types';

const TRIES = 10_000;
const SEGMENTS = 10;
const FRAME_TRIES = 200;
const FRAMES = 30;
const DIM = 512;
const TEXT_BUDGET_MS = 50;
const LIKE_BUDGET_MS = 200;
const NOW = new Date(2026, 10, 14, 12);

const VERBS = ['reach', 'grasp', 'lift', 'place', 'push', 'walk', 'turn', 'drop', 'pour', 'wipe'];
const COLORS = ['red', 'blue', 'green', 'yellow', 'black', 'white'];
const OBJECTS = ['block', 'mug', 'cup', 'bolt', 'duck', 'sponge', 'bottle', 'box'];
const ROBOTS = ['SO-101 Arm', 'Hexapod', 'G1', 'Rover', 'Koch Arm'];
const INPUTS = ['leader-arm', 'gamepad', 'keys', 'camera', null];
const SOURCES: TrySource[] = ['case', 'generated', 'real'];
const TAGS = ['wobbly', 'slow', 'clean', 'collision', 'demo'];

const pick = <T>(list: T[], i: number) => list[i % list.length];

function segments(i: number): TrySegment[] {
  return Array.from({ length: SEGMENTS }, (_, s) => ({
    id: `s${s}`,
    label: `${pick(VERBS, i + s)} ${pick(COLORS, i * 7 + s)} ${pick(OBJECTS, i * 3 + s)}`,
    start: s * 3,
    end: s * 3 + 3,
    ...(s % 4 === 0 ? { tags: [pick(TAGS, i + s)] } : {}),
    ...(s % 3 === 0 ? { outcome: s % 2 ? ('failed' as const) : ('passed' as const) } : {}),
  }));
}

const armMotion = (i: number) => (i % 2 ? graspMotion(1 + (i % 9) / 10, (i % 5) / 100) : waveMotion());

function corpus(): StoredTry[] {
  return Array.from({ length: TRIES }, (_, i) => {
    const robot = pick(ROBOTS, i);
    const mobile = robot === 'Hexapod' || robot === 'Rover';

    return storedTry({
      id: `try-${i}`,
      robot,
      sceneId: `scene-${i % 40}`,
      caseName: `${pick(VERBS, i)} the ${pick(OBJECTS, i * 5)}`,
      source: pick(SOURCES, i),
      input: pick(INPUTS, i),
      startedAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
      seconds: 30 + (i % 60),
      verdict: i % 3 ? 'passed' : 'failed',
      segments: segments(i),
      tags: i % 5 ? [] : [pick(TAGS, i)],
      instruction: i % 7 ? undefined : `${pick(VERBS, i)} the ${pick(COLORS, i)} ${pick(OBJECTS, i)} into the bin`,
      motion: mobile ? walkMotion() : armMotion(i),
    });
  });
}

function timed(run: () => unknown, times: number): number[] {
  return Array.from({ length: times }, () => {
    const started = performance.now();

    run();

    return performance.now() - started;
  }).sort((a, b) => a - b);
}

const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

const frameVectors = (seed: number) =>
  Array.from({ length: FRAMES }, (_, f) => ({
    at: f,
    vector: Float32Array.from({ length: DIM }, (_, k) => Math.sin(seed * 31 + f * 7 + k)),
  }));

describe('try search at 10,000 tries and 100,000 segments', () => {
  it('answers a text search under 50 ms and More Like This under 200 ms', () => {
    const tries = corpus();
    const started = performance.now();
    const index = new TrySearchIndex();

    index.put(tries);

    for (let i = 0; i < FRAME_TRIES; i++) index.putFrames(`try-${i * 50}`, frameVectors(i));

    const buildMs = performance.now() - started;
    const vocab = index.vocab();
    const query =
      (text: string, textVector: Float32Array | null = null) =>
      () =>
        index.search(parseQuery(text, vocab, NOW), { limit: 200, textVector });
    const text = Float32Array.from({ length: DIM }, (_, k) => Math.cos(k));
    const texts = [
      'failed grasp red block leader-arm',
      'walk hexapod over 30 s',
      'last week',
      'wobbly',
      'red',
      'grasp the blue mug',
      'pour yellow duck bin',
    ].flatMap((q) => timed(query(q), 9));
    const withFrames = timed(query('red mug', text), 9);
    const like = timed(query('like:try-1'), 9);
    const likeSegment = timed(query('like:try-3/s4 passed'), 9);
    const snapshotStarted = performance.now();
    const bytes = index.snapshot();
    const snapshotMs = performance.now() - snapshotStarted;
    const loadStarted = performance.now();
    const restored = TrySearchIndex.fromSnapshot(bytes);
    const loadMs = performance.now() - loadStarted;
    const all = [...texts].sort((a, b) => a - b);

    console.log(
      [
        `build ${buildMs.toFixed(0)} ms`,
        `text median ${at(all, 0.5).toFixed(1)} ms, p95 ${at(all, 0.95).toFixed(1)} ms`,
        `text with ${FRAME_TRIES * FRAMES} frames median ${at(withFrames, 0.5).toFixed(1)} ms`,
        `More Like This median ${at(like, 0.5).toFixed(1)} ms (segment ${at(likeSegment, 0.5).toFixed(1)} ms)`,
        `snapshot ${(bytes.length / 1e6).toFixed(1)} MB, written ${snapshotMs.toFixed(0)} ms, read ${loadMs.toFixed(0)} ms`,
      ].join('\n'),
    );

    expect(restored).not.toBeNull();
    expect(at(all, 0.5)).toBeLessThan(TEXT_BUDGET_MS);
    expect(at(withFrames, 0.5)).toBeLessThan(TEXT_BUDGET_MS);
    expect(at(like, 0.5)).toBeLessThan(LIKE_BUDGET_MS);
  });
});
