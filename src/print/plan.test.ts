import * as THREE from 'three';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { printerModel, resolvePrinter } from '../data/printers';
import { buildGuidePlan } from '../guide/guidePlan';
import { approximateScene } from '../guide/guideScene';
import { firstSteps } from '../guide/guideSteps';
import { checkPrintability } from '../three/printability';
import type { PrintMaterial, ScenePart } from '../types/robotics';
import { bedOf } from './bed';
import { packPlates } from './pack';
import { buildPrintPlan, choosePose, itemMatrix, turnedPrint } from './plan';
import { planInput } from './plan.fixtures';
import { weld, writeThreeMf } from './threeMf';

const bed = bedOf(printerModel('bambu-lab-p1s')!);

function lShape() {
  const a = new THREE.BoxGeometry(60, 8, 30).toNonIndexed();
  const b = new THREE.BoxGeometry(8, 40, 30).toNonIndexed().translate(26, 24, 0);
  const tris = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);

  return new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(tris, 3)))
    .rotateX(0.7)
    .rotateZ(0.3);
}

function placedBounds(tris: Float32Array, matrix: number[]) {
  const m = new THREE.Matrix4().fromArray(matrix);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  for (let i = 0; i < tris.length; i += 3) box.expandByPoint(v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(m));

  return box;
}

describe('plate transforms', () => {
  const mesh = lShape();

  mesh.updateMatrixWorld();

  const tris = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).attributes.position.array as Float32Array;
  const shape = checkPrintability(tris)!;
  const check = choosePose(shape, bed);

  it('puts a tilted part flat on the bed, filling its packed rectangle', () => {
    for (const yaw of [0, 90]) {
      const [w, d] = yaw ? [check.size[1], check.size[0]] : [check.size[0], check.size[1]];
      const place = { x: 40, y: 30, w, d, yaw };
      const box = placedBounds(tris, itemMatrix(check.pose, place, bed));

      expect(box.min.z).toBeCloseTo(0, 3);
      expect(box.max.z).toBeCloseTo(check.size[2], 2);
      expect(box.min.x).toBeCloseTo(40, 2);
      expect(box.min.y).toBeCloseTo(30, 2);
      expect(box.max.x).toBeCloseTo(40 + w, 2);
      expect(box.max.y).toBeCloseTo(30 + d, 2);
    }
  });

  it('finds the L-bracket’s large flat face as a resting pose', () => {
    expect(shape.poses.length).toBeGreaterThan(6);
    expect(check.contactMm2).toBeGreaterThan(1000);
  });

  it('writes a 3MF whose second plate sits one plate width and a fifth along', () => {
    const matrix = itemMatrix(check.pose, { x: 10, y: 10, w: check.size[0], d: check.size[1], yaw: 0 }, bed);
    const file = writeThreeMf({
      layout: 'grid',
      plateSize: [256, 256],
      plates: [
        { number: 1, name: 'Plate 1' },
        { number: 2, name: 'Plate 2' },
      ],
      objects: [{ id: 1, name: 'L & bracket', mesh: weld(tris) }],
      items: [
        { objectId: 1, matrix, plate: 1 },
        { objectId: 1, matrix, plate: 2 },
      ],
    });
    const model = strFromU8(unzipSync(file)['3D/3dmodel.model']);
    const offsets = [...model.matchAll(/transform="([^"]+)"/g)].map((m) => Number(m[1].split(' ')[9]));

    expect(model).toContain('name="L &amp; bracket"');
    expect(offsets[1] - offsets[0]).toBeCloseTo(256 * 1.2, 3);
  });
});

describe('turning a part on its plate', () => {
  const item = { id: 'arm', copy: 0, name: 'Arm', x: 20, y: 30, w: 100, d: 40, h: 10, yaw: 0, matrix: [] };
  const plate = { number: 2, local: 1, material: 'PLA' as const, items: [item], grams: 0, hours: 0, hash: '' };

  it('keeps the part where it sits and turns it a quarter', () => {
    const turned = turnedPrint([plate], 'arm')!;
    const { placements } = packPlates(
      [{ id: 'arm', w: 100, d: 40, fixed: { plate: turned.plate!, x: 20, y: 30, turned: !!turned.turned } }],
      bed,
    );

    expect(turned).toEqual({ turned: true, at: [20, 30], plate: 1 });
    expect(placements.arm).toMatchObject({ plate: 1, x: 20, y: 30, w: 40, d: 100, yaw: 90 });
  });

  it('turns a turned part back', () => {
    expect(turnedPrint([{ ...plate, items: [{ ...item, yaw: 90 }] }], 'arm')?.turned).toBe(false);
  });

  it('leaves a part that is not on a plate alone', () => {
    expect(turnedPrint([plate], 'missing')).toBeNull();
  });
});

const setup = resolvePrinter('bambu-lab-p1s', []);

type V3 = [number, number, number];

const part = (id: string, position: V3, size: V3): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
});

const robot = [
  part('base', [0, 10, 0], [140, 20, 140]),
  part('front-leg', [0, -60, 0], [150, 120, 150]),
  part('back-leg', [0, -190, 0], [150, 140, 150]),
];

const footprint = (p: ScenePart): V3 => [p.dimensions.width!, p.dimensions.depth!, p.dimensions.height!];

function planFor(assembly: string[], material: (id: string) => PrintMaterial = () => 'PLA') {
  const guide = buildGuidePlan({ ...approximateScene('', robot, []), order: { assembly, unproven: [] } }, 'PLA');
  const first = firstSteps(guide.steps.map((s) => s.partIds));
  const inputs = robot.map((p) =>
    planInput(p.id, footprint(p), { material: material(p.id), firstStep: first.get(p.id) }),
  );

  return buildPrintPlan(inputs, setup, bed, 'fine');
}

const plateIds = (plan: ReturnType<typeof planFor>) => plan.plates.map((p) => p.items.map((it) => it.id));

describe('build-order plates', () => {
  it('packs the part the proven order builds first onto plate 1', () => {
    const plan = planFor(['base', 'front-leg', 'back-leg']);

    expect(plan.plates[0].items.map((it) => it.id)).toEqual(['base']);
    expect(plan.plates.map((p) => p.step)).toEqual([0, 1, 2]);
  });

  it('follows the order when it changes, and keeps every hash when it does not', () => {
    const forward = planFor(['base', 'front-leg', 'back-leg']);
    const again = planFor(['base', 'front-leg', 'back-leg']);
    const reversed = planFor(['back-leg', 'front-leg', 'base']);

    expect(plateIds(reversed)[0]).toEqual(['back-leg']);
    expect(plateIds(reversed)).not.toEqual(plateIds(forward));
    expect(again.plates.map((p) => p.hash)).toEqual(forward.plates.map((p) => p.hash));
    expect(JSON.stringify(again)).toBe(JSON.stringify(forward));
  });

  it('numbers plates by their earliest step across materials', () => {
    const plan = planFor(['front-leg', 'base', 'back-leg'], (id) => (id === 'base' ? 'PETG' : 'PLA'));

    expect(plan.plates.map((p) => [p.material, p.items.map((it) => it.id)])).toEqual([
      ['PLA', ['front-leg']],
      ['PETG', ['base']],
      ['PLA', ['back-leg']],
    ]);
    expect(plan.plates.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(plan.plates.map((p) => p.local)).toEqual([1, 1, 2]);
  });

  it('puts a part no step uses on the last plate, even when an earlier plate has room', () => {
    const inputs = [
      planInput('first', [200, 200, 20], { firstStep: 0 }),
      planInput('second', [200, 200, 20], { firstStep: 1 }),
      planInput('spare', [20, 20, 5]),
    ];
    const plan = buildPrintPlan(inputs, setup, bed, 'fine');

    expect(plan.plates.map((p) => p.items.map((it) => it.id).sort())).toEqual([['first'], ['second', 'spare']]);
    expect(plan.plateOf.spare).toBe(2);
  });

  it('packs a scene with no guide steps the way it always has, largest first', () => {
    const inputs = [
      planInput('small', [60, 60, 10]),
      planInput('large', [150, 150, 10]),
      planInput('mid', [150, 120, 10]),
    ];
    const plan = buildPrintPlan(inputs, setup, bed, 'fine');

    expect(plan.plates.map((p) => p.step)).toEqual([undefined, undefined]);
    expect(plan.plates.map((p) => p.items.map((it) => it.id).sort())).toEqual([['large', 'small'], ['mid']]);
  });

  it('leaves a part pinned to a spot where it is, whatever its step', () => {
    const inputs = [
      planInput('first', [100, 100, 20], { firstStep: 0 }),
      planInput('pinned', [40, 40, 20], { firstStep: 5, print: { plate: 1, at: [180, 180] } }),
    ];
    const plan = buildPrintPlan(inputs, setup, bed, 'fine');
    const pinned = plan.plates.flatMap((p) => p.items).find((it) => it.id === 'pinned')!;

    expect([pinned.x, pinned.y]).toEqual([180, 180]);
    expect(plan.plateOf.pinned).toBe(1);
  });
});
