import { describe, expect, it } from 'vitest';
import { parseQuery } from './queryParser';
import { graspMotion, storedTry, walkMotion, waveMotion } from './fixtures/searchFixtures';
import { TrySearchIndex } from './searchIndex';
import type { StoredTry, TrySource } from '../tryFile';

const TRIES = 10_000;
const TEXT_BUDGET_MS = 50;
const LIKE_BUDGET_MS = 200;
const NOW = new Date(2026, 10, 14, 12);

const VERBS = ['reach', 'grasp', 'lift', 'place', 'push', 'walk', 'turn', 'drop', 'pour', 'wipe'];
const COLORS = ['red', 'blue', 'green', 'yellow', 'black', 'white'];
const OBJECTS = ['block', 'mug', 'cup', 'bolt', 'duck', 'sponge', 'bottle', 'box'];
const ROBOTS = ['SO-101 Arm', 'Hexapod', 'G1', 'Rover', 'Koch Arm'];
const INPUTS = ['leader-arm', 'gamepad', 'keys', 'camera', null];
const SOURCES: TrySource[] = ['case', 'generated', 'real'];

const pick = <T>(list: T[], i: number) => list[i % list.length];

const armMotion = (i: number) => (i % 2 ? graspMotion(1 + (i % 9) / 10, (i % 5) / 100) : waveMotion());

function corpus(): StoredTry[] {
  return Array.from({ length: TRIES }, (_, i) => {
    const robot = pick(ROBOTS, i);
    const mobile = robot === 'Hexapod' || robot === 'Rover';

    return storedTry({
      id: `try-${i}`,
      robot,
      sceneId: `scene-${i % 40}`,
      caseName: `${pick(VERBS, i)} the ${pick(COLORS, i * 7)} ${pick(OBJECTS, i * 5)}`,
      source: pick(SOURCES, i),
      input: pick(INPUTS, i),
      startedAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
      seconds: 30 + (i % 60),
      verdict: i % 3 ? 'passed' : 'failed',
      task: `${pick(VERBS, i + 3)} the ${pick(COLORS, i)} ${pick(OBJECTS, i)} into the bin, then ${pick(VERBS, i + 1)} back`,
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

describe('try search at 10,000 tries', () => {
  it('answers a text search under 50 ms and More Like This under 200 ms', () => {
    const tries = corpus();
    const started = performance.now();
    const index = new TrySearchIndex();

    index.put(tries);

    const buildMs = performance.now() - started;
    const vocab = index.vocab();
    const query = (text: string) => () => index.search(parseQuery(text, vocab, NOW), 200);
    const texts = [
      'failed grasp red block leader-arm',
      'walk hexapod over 30 s',
      'last week',
      'red',
      'grasp the blue mug',
      'pour yellow duck bin',
    ].flatMap((q) => timed(query(q), 9));
    const like = timed(query('like:try-1'), 9);
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
        `More Like This median ${at(like, 0.5).toFixed(1)} ms`,
        `snapshot ${(bytes.length / 1e6).toFixed(1)} MB, written ${snapshotMs.toFixed(0)} ms, read ${loadMs.toFixed(0)} ms`,
      ].join('\n'),
    );

    expect(restored).not.toBeNull();
    expect(at(all, 0.5)).toBeLessThan(TEXT_BUDGET_MS);
    expect(at(like, 0.5)).toBeLessThan(LIKE_BUDGET_MS);
  });
});
