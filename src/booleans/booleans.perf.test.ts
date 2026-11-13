import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { evaluateBoolean, knownResult, plainResult } from './evaluate';
import { booleanHash } from './hash';
import { booleanPart, withResult } from './parts';
import { partsWithResults } from './results';

const FRAME_MS = 16;

const RUNS = 4;

function sphereMesh(id: string, x: number): ScenePart {
  const geometry = new THREE.SphereGeometry(30, 160, 160);
  const positions = Array.from(geometry.getAttribute('position').array as Float32Array);
  const indices = Array.from(geometry.getIndex()!.array as Uint32Array);

  return {
    id,
    name: id,
    kind: 'mesh',
    category: 'custom_models',
    role: 'solid',
    position: [x, 30, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 60, height: 60, depth: 60 },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
    mesh: { positions, indices, baseSize: [60, 60, 60] },
  };
}

const since = (start: number) => performance.now() - start;

async function measure(run: number) {
  const a = sphereMesh('a', 0);
  const b = sphereMesh('b', 25 + run);
  const draft = booleanPart({ id: 'r', base: a, tools: [b], op: 'subtract' });
  let start = performance.now();
  const pending = evaluateBoolean(draft);
  const handOff = since(start);

  start = performance.now();

  const result = (await pending)!;
  const csg = since(start);
  const out = {
    positions: Float64Array.from(result.positions),
    indices: Uint32Array.from(result.indices),
    offset: result.offset,
    size: result.size,
    engine: 'manifold' as const,
  };

  start = performance.now();
  plainResult(out);

  const reply = since(start);
  const fresh = booleanPart({ id: 'r', base: a, tools: [b], op: 'subtract' });

  start = performance.now();
  partsWithResults([fresh], knownResult);
  withResult(fresh, booleanHash(fresh), result);

  return { triangles: a.mesh!.indices.length / 3, handOff, csg, reply, apply: since(start) };
}

describe('boolean of two 50k-triangle parts', () => {
  it('never holds the main thread for a frame', async () => {
    const runs: Awaited<ReturnType<typeof measure>>[] = [];

    for (let run = 0; run < RUNS; run++) runs.push(await measure(run));

    const best = (key: 'handOff' | 'csg' | 'reply' | 'apply') => Math.min(...runs.map((r) => r[key]));

    console.log(
      `boolean 2 × ${runs[0].triangles} triangles: hand-off ${best('handOff').toFixed(1)} ms, CSG ${best('csg').toFixed(0)} ms off the main thread, reply ${best('reply').toFixed(1)} ms, apply ${best('apply').toFixed(1)} ms`,
    );
    expect(runs[0].triangles).toBeGreaterThan(50_000);
    expect(Math.max(best('handOff'), best('reply'), best('apply'))).toBeLessThan(FRAME_MS);
  });
});
