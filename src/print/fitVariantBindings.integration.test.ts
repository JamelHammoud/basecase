import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { afterAll, expect, it } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { booleanPart } from '../booleans/parts';
import { generatedFit, fitServices } from './fitVariants.fixtures';
import { fitSourceHash } from './fitVariantIdentity';
import { fitVariantCoupons } from './fitVariantGeometry';
import { fitBindings, prepareFitVariants } from './fitVariants';
import { addCircle } from '../utils/sketch/edit';
import { GROUND_PLANE, partFromSolid, sketchSolid } from '../utils/sketch/placement';
import { prepareParameterEdit } from '../utils/designParameters/transaction';
import type { RenderedCad } from '../utils/platform/types';

interface Kernel {
  renderPart: (language: string, code: string) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(new URL('../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href);
const kernel: Kernel = createNodeKernel();

afterAll(() => kernel.stopKernels());

function diameter(positions: Float32Array) {
  const solid = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const bvh = new MeshBVH(solid);
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
  const positive = bvh.raycastFirst(ray, THREE.DoubleSide)!.distance;

  ray.direction.negate();

  const negative = bvh.raycastFirst(ray, THREE.DoubleSide)!.distance;

  solid.dispose();

  return positive + negative;
}

it('regenerates actual OpenSCAD numeric bindings through the native kernel before cutting coupons', async () => {
  const code = 'bore = 22;\ndifference() { cube([80,80,12],center=true); cylinder(d=bore,h=20,center=true,$fn=32); }';
  const rendered = await kernel.renderPart('openscad', code);

  expect(rendered.ok, rendered.error).toBe(true);

  const part = {
    ...specToPart({
      id: 'host',
      shape: 'cad_part',
      position: [0, 0, 0],
      material: 'petg',
      cad: {
        language: 'openscad',
        code,
        positions: rendered.positions!,
        indices: rendered.indices!,
      },
    }),
    dimensionBindings: [{ kind: 'cad' as const, target: 'bore', unit: 'mm' as const, expression: 'bore' }],
  };
  const mate = (await generatedFit()).parts[1];
  const services = {
    ...fitServices,
    sourceHash: fitSourceHash,
    cut: fitVariantCoupons,
    compile: (_part: unknown, next: string) => kernel.renderPart('openscad', next),
  };
  const source = { parts: [part, mate], parameters: [{ name: 'bore', unit: 'mm' as const, value: 22 }] };
  const comparison = await prepareFitVariants(
    source,
    {
      binding: fitBindings(source)[0],
      fit: 'mate',
      values: [21.9, 22, 22.1],
      down: [0, -1, 0],
      material: 'PETG',
    },
    services,
  );

  expect(comparison.candidates.map((c) => c.reason)).toEqual([undefined, undefined, undefined]);

  for (const [index, candidate] of comparison.candidates.entries())
    expect(diameter(candidate.coupon!.positions)).toBeCloseTo([21.9, 22, 22.1][index], 3);
});

it('solves dimensional Sketch constraints and recuts their connected host without publishing the source', async () => {
  const circle = addCircle({ points: [], entities: [], constraints: [] }, { at: [0, 0] }, 11, true)!;
  const constraint = circle.sketch.constraints.find((c) => c.kind === 'radius')!;
  const solid = sketchSolid(
    { ...GROUND_PLANE, origin: [0, -10, 0] },
    { sketch: circle.sketch, mode: 'extrude', depth: 20 },
    { id: 'circle', name: 'Bore', color: '#999999' },
  )!;
  const tool = {
    ...partFromSolid(specToPart({ id: 'sketch', shape: 'box' }), solid),
    dimensionBindings: [{ kind: 'sketch' as const, target: constraint.id, unit: 'mm' as const, expression: 'radius' }],
  };
  const base = specToPart({ id: 'base', shape: 'box', size: [80, 80, 12], position: [0, 0, 0] });
  const host = booleanPart({ id: 'host', base, tools: [tool], op: 'subtract' });
  const mate = (await generatedFit()).parts[1];
  const source = await prepareParameterEdit(
    { parts: [host, mate], parameters: [{ name: 'radius', unit: 'mm', value: 11 }] },
    { ...fitServices, verify: true },
  );
  const saved = JSON.stringify(source);
  const comparison = await prepareFitVariants(
    source,
    {
      binding: fitBindings(source)[0],
      fit: 'mate',
      values: [10.9, 11, 11.1],
      down: [0, -1, 0],
      material: 'PETG',
    },
    { ...fitServices, sourceHash: fitSourceHash, cut: fitVariantCoupons },
  );

  expect(comparison.candidates.map((c) => c.reason)).toEqual([undefined, undefined, undefined]);

  for (const [index, candidate] of comparison.candidates.entries())
    expect(diameter(candidate.coupon!.positions)).toBeCloseTo([21.8, 22, 22.2][index], 3);

  expect(JSON.stringify(source)).toBe(saved);
});
