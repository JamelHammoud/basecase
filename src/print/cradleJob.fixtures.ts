import { Matrix4 } from 'three';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { localTriangles, rigidFrame } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { resolvePrinter } from '../data/printers';
import type { ManifoldApi } from '../wrap/manifold';
import { cradleFixture } from './cradle.fixtures';
import type { CradleJob } from './cradleJob';

export function cradleJobFixture(api: ManifoldApi, index: number): CradleJob {
  const input = cradleFixture(api, index);
  const body: ScenePart = {
    id: input.sources[0].id,
    name: input.sources[0].id,
    kind: 'sculpt_mesh',
    role: 'solid',
    category: 'custom_models',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 1, height: 1, depth: 1 },
    color: '#eeeeee',
    note: '',
    visible: true,
    locked: false,
    mechanicalTag: '3D Printed PLA/PETG',
    sculptMesh: { positions: Array.from(input.sources[0].positions) },
  };
  const screw: ScenePart = {
    ...body,
    id: 'screw',
    name: 'M3 screw',
    kind: 'hardware',
    sculptMesh: undefined,
    hardware: { type: 'socket_head', size: 'M3', length: 8 },
    position: [5, 5, 20],
    rotation: [90, 0, 0],
  };
  const parts = [body, screw];
  const groups = parts.map((part) => buildPartGroup(part, false));
  const identity = new Matrix4().toArray();

  try {
    const geometries = groups.map((group, i) => ({ id: parts[i].id, positions: localTriangles(group), index: null }));

    return {
      sessionId: 1,
      geometries,
      shapes: parts.map((part) => ({ key: part.id, meshes: [{ geometry: part.id, matrix: identity }] })),
      instances: groups.map((group, i) => ({
        id: parts[i].id,
        key: parts[i].id,
        matrix: rigidFrame(group).matrix.toArray(),
      })),
      ids: [body.id],
      options: input,
      parts,
      project: structuredClone(DEFAULT_PROJECT),
      printer: resolvePrinter('bambu-lab-p1s', []),
      plan: {
        title: body.name,
        partIds: parts.map((part) => part.id),
        modules: [],
        items: [
          {
            key: 'screw',
            label: 'B',
            kind: 'hardware',
            name: screw.name,
            detail: '',
            qty: 1,
            partIds: ['screw'],
            sample: 'screw',
          },
        ],
        tools: [{ id: 'driver', name: '2.5 mm hex key', size: '2.5 mm', icon: 'hex-key', itemKeys: ['screw'] }],
        steps: [
          {
            kind: 'build',
            number: 1,
            moduleId: 'main',
            partIds: parts.map((part) => part.id),
            contextIds: [],
            moves: [{ partId: 'screw', offset: [0, 0, 40] }],
            arrows: [],
            callout: [],
            tools: ['driver'],
          },
        ],
      },
      sceneId: 'fixture',
      fingerprint: `fixture-${index}`,
      step: 0,
    };
  } finally {
    groups.forEach(releasePartGroup);
  }
}
