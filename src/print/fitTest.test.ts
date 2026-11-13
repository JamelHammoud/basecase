import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { heatInsert } from '../data/hardware';
import { place } from '../three/analysis/collide';
import { fitCoupons } from '../three/analysis/fitCoupons';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import { measureTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { couponPart, fitKey, fitTestInput, fitTestReport } from './fitTest';

const SERVO: [number, number, number] = [45.2, 35, 24.7];
const INSERT = heatInsert({ size: 'M3', length: 4 });
const INSERT_SPOTS: Array<[number, number]> = [
  [-30, -20],
  [-30, 20],
  [30, -20],
  [30, 20],
];

const part = (id: string, extra: Partial<ScenePart>): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#e4e4e7',
  note: '',
  mechanicalTag: '3D Printed PLA/PETG',
  visible: true,
  locked: false,
  ...extra,
});

const PARTS: ScenePart[] = [
  part('servo-bracket', {}),
  part('insert-plate', {}),
  part('servo', { kind: 'component', category: 'actuators', componentId: 'feetech-sts3215', componentVariant: 'c001' }),
  ...INSERT_SPOTS.map((_, i) =>
    part(`insert-${i}`, {
      kind: 'hardware',
      category: 'hardware',
      hardware: { type: 'heat_insert', size: 'M3', length: 4 },
    }),
  ),
];

function brush(geometry: THREE.BufferGeometry) {
  const b = new Brush(geometry.toNonIndexed());

  b.geometry.deleteAttribute('uv');
  b.geometry.computeVertexNormals();
  b.updateMatrixWorld();

  return b;
}

function carve(base: THREE.BufferGeometry, holes: THREE.BufferGeometry[]): Float32Array {
  const evaluator = new Evaluator();

  evaluator.useGroups = false;
  evaluator.attributes = ['position', 'normal'];

  const result = holes.reduce((acc, hole) => evaluator.evaluate(acc, brush(hole), SUBTRACTION), brush(base));
  const flat = result.geometry.index ? result.geometry.toNonIndexed() : result.geometry;

  return new Float32Array(flat.attributes.position.array);
}

const boxTris = (w: number, h: number, d: number) =>
  new Float32Array(new THREE.BoxGeometry(w, h, d).toNonIndexed().attributes.position.array);

const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

const servoBracket = carve(new THREE.BoxGeometry(120, 60, 80), [
  new THREE.BoxGeometry(SERVO[0], SERVO[1] + 10, SERVO[2]).translate(0, 17.5, 0),
]);
const insertPlate = carve(
  new THREE.BoxGeometry(100, 8, 60),
  INSERT_SPOTS.map(([x, z]) => new THREE.CylinderGeometry(INSERT.hole / 2, INSERT.hole / 2, 6, 32).translate(x, 3, z)),
);

const placed = [
  place('servo-bracket', new ShapeSolid(servoBracket), at(0, 30, 0)),
  place('insert-plate', new ShapeSolid(insertPlate), at(200, 4, 0)),
  place('servo', new ShapeSolid(boxTris(...SERVO)), at(0, 42.5, 0)),
  ...INSERT_SPOTS.map(([x, z], i) =>
    place(`insert-${i}`, new ShapeSolid(boxTris(INSERT.od, INSERT.l, INSERT.od)), at(200 + x, 6, z)),
  ),
];

const input = fitTestInput(PARTS);
const coupons = fitCoupons(placed, { ...input, downs: { 'servo-bracket': [0, -1, 0], 'insert-plate': [0, -1, 0] } });
const hostVolume: Record<string, number> = {
  'servo-bracket': measureTriangles(servoBracket).volumeMm3,
  'insert-plate': measureTriangles(insertPlate).volumeMm3,
};

function materialAlongAxis(positions: Float32Array, coupon: (typeof coupons)[number]) {
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const bvh = new MeshBVH(geometry);
  const center = new THREE.Vector3(...coupon.center);
  const axis = new THREE.Vector3(...coupon.axis);

  return [axis, axis.clone().negate()].some((dir) => {
    const hit = bvh.raycastFirst(new THREE.Ray(center, dir), THREE.DoubleSide);

    return !!hit && hit.distance < coupon.reach - 0.05;
  });
}

describe('fit test', () => {
  it('groups fits by kind and spec', () => {
    expect(input.hosts).toEqual(['servo-bracket', 'insert-plate']);
    expect(new Set(input.fits.map((f) => f.key))).toEqual(
      new Set(['servo:feetech-sts3215', `insert:M3|${INSERT.l}|${INSERT.od}`]),
    );
    expect(fitKey(part('screw', { kind: 'hardware', hardware: { type: 'socket_head', size: 'M3', length: 8 } }))).toBe(
      'screw:M3',
    );
    expect(fitKey(part('bearing', { kind: 'hardware', hardware: { type: 'bearing', size: '608' } }))).toBe(
      'bearing:bearing|608',
    );
  });

  it('cuts one coupon per group from the host that holds it', () => {
    expect(coupons.map((c) => [c.key, c.host])).toEqual([
      ['servo:feetech-sts3215', 'servo-bracket'],
      [`insert:M3|${INSERT.l}|${INSERT.od}`, 'insert-plate'],
    ]);
  });

  it('keeps each coupon under 15% of its host', () => {
    for (const c of coupons) {
      expect(c.measure.volumeMm3).toBeGreaterThan(0);
      expect(c.measure.volumeMm3 / hostVolume[c.host]).toBeLessThan(0.15);
    }
  });

  it('keeps the fit open: a ray down the fit axis meets no material inside the hole', () => {
    for (const c of coupons) expect(materialAlongAxis(c.positions, c)).toBe(false);
  });

  it('keeps each host print pose', () => {
    for (const c of coupons) expect(c.pose.down).toEqual([0, -1, 0]);
  });

  it('puts both coupons on one plate', () => {
    const parts = coupons.map((c, i) =>
      couponPart(
        c,
        PARTS.find((p) => p.id === c.host),
        i,
      ),
    );
    const report = fitTestReport(coupons, parts, {
      project: DEFAULT_PROJECT,
      printer: resolvePrinter('bambu-lab-p1s', []),
    });

    expect(report.plan.plates).toHaveLength(1);
    expect(report.plan.plates[0].items.map((it) => it.id).sort()).toEqual(['fit-test-1', 'fit-test-2']);
  });
});
