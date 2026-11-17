import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boundsOf, solidObjects } from './measurements';
import type { ViewportContext } from './viewportContext';

const RADIUS = 50;

it('keeps derived board components out of generic assembly while allowing explicit route obstacles', () => {
  const source = { id: 'board', role: 'solid', kind: 'box', visible: true };
  const header = { ...source, id: 'derived-header', kind: 'component' };
  const root = new THREE.Group();

  for (const part of [source, header]) {
    const object = new THREE.Group();

    object.userData.partId = part.id;
    root.add(object);
  }

  const ctx = {
    props: () => ({ sourceParts: [source] }),
    stage: { partsRoot: root },
    layer: { part: (id: string) => [source, header].find((part) => part.id === id) },
  } as unknown as ViewportContext;

  expect(solidObjects(ctx, { visibleOnly: false }).map((part) => part.id)).toEqual(['board']);
  expect(solidObjects(ctx, { visibleOnly: false, includeDerived: true }).map((part) => part.id)).toEqual([
    'board',
    'derived-header',
  ]);
});

function wheelContext(spin: number) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, 20, 96).rotateX(Math.PI / 2));

  wheel.position.set(0, RADIUS, 0);
  wheel.rotation.z = spin;
  wheel.updateMatrixWorld(true);

  return { layer: { get: () => wheel } } as unknown as ViewportContext;
}

describe('boundsOf', () => {
  it('finds the true bottom of a wheel however far it has spun', () => {
    for (const spin of [0, Math.PI / 8, Math.PI / 4, 1]) {
      const bounds = boundsOf(wheelContext(spin), ['wheel']);

      expect(bounds!.min[1]).toBeCloseTo(0, 0);
      expect(bounds!.max[1]).toBeCloseTo(2 * RADIUS, 0);
    }
  });
});
