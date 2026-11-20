import * as THREE from 'three';
import { beforeAll, expect, it } from 'vitest';
import { loadManifold, type ManifoldApi } from '../wrap/manifold';
import type { FastenerChain } from '../assembly/assemblyTypes';
import { makeCradle } from './cradle';
import { cradleFixture } from './cradle.fixtures';
import { checkCradleAccess } from './cradleAccess';

let api: ManifoldApi;

beforeAll(async () => {
  api = await loadManifold();
});

const chain: FastenerChain = {
  id: 'screw',
  d: 3,
  axis: [0, 0, 1],
  top: [5, 5, 22],
  tip: [5, 5, 12],
  headR: 3,
  stack: [],
  endsIn: { kind: 'printed' },
  engagementMm: 8,
  needMm: 3,
  problems: [],
};

it('checks complete insertion and driver envelopes, including an obstruction between screening rays', () => {
  const input = cradleFixture(api, 0);
  const geometry = makeCradle(api, input);
  const access = {
    sources: input.sources,
    moves: [{ partId: input.sources[0].id, offset: [0, 0, 40] as [number, number, number] }],
    drivers: [{ chain, tool: 'straight' as const }],
  };

  expect(() => checkCradleAccess(api, geometry, access)).not.toThrow();

  const obstruction = new THREE.BoxGeometry(0.1, 0.1, 2).translate(5.6, 5.6, 28).toNonIndexed();
  const blocked = {
    ...access,
    sources: [
      ...access.sources,
      { id: 'obstruction', positions: new Float32Array(obstruction.attributes.position.array) },
    ],
  };

  expect(() => checkCradleAccess(api, geometry, blocked)).toThrow('cradle:driver');
  expect(() =>
    checkCradleAccess(api, geometry, { ...access, moves: [{ partId: input.sources[0].id, offset: [80, 0, 0] }] }),
  ).toThrow('cradle:move');
});

it('checks the full hex-key turning envelope and refuses unresolved moves', () => {
  const input = cradleFixture(api, 0);
  const geometry = makeCradle(api, input);
  const key = { chain, tool: 'L-key' as const };
  const obstruction = new THREE.BoxGeometry(2, 2, 2).translate(40, 5, 43).toNonIndexed();
  const sources = [
    ...input.sources,
    { id: 'key obstruction', positions: new Float32Array(obstruction.attributes.position.array) },
  ];

  expect(() => checkCradleAccess(api, geometry, { sources: input.sources, moves: [], drivers: [key] })).not.toThrow();
  expect(() => checkCradleAccess(api, geometry, { sources, moves: [], drivers: [key] })).toThrow('cradle:driver');
  expect(() =>
    checkCradleAccess(api, geometry, { sources, moves: [{ partId: 'missing', offset: [0, 0, 10] }], drivers: [] }),
  ).toThrow('cradle:source');
});

it('enlarges the key shaft for its declared size and refuses unresolved envelopes', () => {
  const input = cradleFixture(api, 0);
  const geometry = makeCradle(api, input);
  const obstruction = new THREE.BoxGeometry(0.1, 0.1, 1).translate(7.2, 5, 27).toNonIndexed();
  const sources = [
    ...input.sources,
    { id: 'shaft obstruction', positions: new Float32Array(obstruction.attributes.position.array) },
  ];

  expect(() =>
    checkCradleAccess(api, geometry, { sources, moves: [], drivers: [{ chain, tool: 'L-key' }] }),
  ).not.toThrow();
  expect(() =>
    checkCradleAccess(api, geometry, { sources, moves: [], drivers: [{ chain, tool: 'L-key', radiusMm: 3 }] }),
  ).toThrow('cradle:driver');
  expect(() =>
    checkCradleAccess(api, geometry, { sources, moves: [], drivers: [{ chain, tool: 'L-key', radiusMm: NaN }] }),
  ).toThrow('cradle:driver');
});

it('refuses a stationary context part intersecting the cradle without any insertion or tool request', () => {
  const input = cradleFixture(api, 0);
  const geometry = makeCradle(api, input);
  const obstacle = new THREE.BoxGeometry(4, 4, 4).translate(10, 10, -1).toNonIndexed();
  const source = { id: 'stationary context', positions: new Float32Array(obstacle.attributes.position.array) };
  const access = { sources: [...input.sources, source], moves: [], drivers: [] };

  expect(() => checkCradleAccess(api, geometry, access)).toThrow('cradle:move');
  obstacle.translate(0, 0, 80);
  source.positions = new Float32Array(obstacle.attributes.position.array);
  expect(() => checkCradleAccess(api, geometry, access)).not.toThrow();
  obstacle.dispose();
});
