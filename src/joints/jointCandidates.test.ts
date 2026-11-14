import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { jointCandidates, type Body } from './jointCandidates';
import { MeshIndex } from './meshIndex';

const body = (id: string, geometry: THREE.BufferGeometry): Body => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;

  return { id, index: new MeshIndex(Float32Array.from(flat.getAttribute('position').array)) };
};

interface Plate {
  width: number;
  from: number;
  to: number;
  z: [number, number];
  holes: Array<{ y: number; r: number }>;
}

function plate({ width, from, to, z, holes }: Plate) {
  const shape = new THREE.Shape();

  shape.moveTo(-width / 2, from);
  shape.lineTo(width / 2, from);
  shape.lineTo(width / 2, to);
  shape.lineTo(-width / 2, to);
  shape.closePath();

  for (const h of holes) shape.holes.push(new THREE.Path().absarc(0, h.y, h.r, 0, Math.PI * 2, true));

  return new THREE.ExtrudeGeometry(shape, { depth: z[1] - z[0], bevelEnabled: false, curveSegments: 40 }).translate(
    0,
    0,
    z[0],
  );
}

const rod = (r: number, y: number, z: [number, number]) =>
  new THREE.CylinderGeometry(r, r, z[1] - z[0], 32).rotateX(Math.PI / 2).translate(0, y, (z[0] + z[1]) / 2);

const HINGE_Y = 70;
const SCREWS = [10, 22];

function twoLinkArm(): Body[] {
  return [
    body(
      'link-1',
      plate({
        width: 12,
        from: 0,
        to: 80,
        z: [-5, 5],
        holes: [{ y: HINGE_Y, r: 4.1 }, ...SCREWS.map((y) => ({ y, r: 1.7 }))],
      }),
    ),
    body('link-2', plate({ width: 12, from: 64, to: 144, z: [5.5, 15.5], holes: [{ y: HINGE_Y, r: 4.1 }] })),
    body('pin', rod(3.9, HINGE_Y, [-6, 16])),
    body('bracket', plate({ width: 12, from: 4, to: 28, z: [-11.5, -5.5], holes: SCREWS.map((y) => ({ y, r: 1.7 })) })),
    ...SCREWS.map((y, i) => body(`screw-${i + 1}`, rod(1.5, y, [-12, 6]))),
  ];
}

describe('joint candidates', () => {
  it('finds the pin joint of a two-link arm and nothing for its bolted bracket', () => {
    const { candidates, fastened } = jointCandidates(twoLinkArm());

    expect(candidates).toHaveLength(1);

    const [hinge] = candidates;

    expect(hinge).toMatchObject({ parent: 'link-1', child: 'link-2', pin: 'pin', shaftOn: 'pin' });
    expect(Math.abs(hinge.axis[2])).toBeCloseTo(1, 4);
    expect(hinge.origin[0]).toBeCloseTo(0, 1);
    expect(hinge.origin[1]).toBeCloseTo(HINGE_Y, 1);
    expect(hinge.radius).toBeCloseTo(3.9, 1);
    expect(hinge.confidence).toBeGreaterThan(0.8);
    expect(fastened.map((pair) => [...pair].sort())).toEqual([['bracket', 'link-1']]);
  });

  it('turns a shaft in a bore with the lower part as the parent', () => {
    const bodies = [
      body('shaft', rod(3.9, 40, [-20, 20])),
      body('block', plate({ width: 30, from: 0, to: 50, z: [-6, 6], holes: [{ y: 40, r: 4.1 }] })),
    ];
    const { candidates, faces } = jointCandidates(bodies);

    expect(candidates).toEqual([
      expect.objectContaining({ parent: 'block', child: 'shaft', shaftOn: 'shaft', engaged: expect.closeTo(12, 1) }),
    ]);
    expect(candidates[0].pin).toBeUndefined();
    expect(faces).toEqual([]);
  });

  it('lists a round face with no partner so a joint can still be placed on it', () => {
    const { candidates, faces } = jointCandidates([
      body('horn', rod(6, 30, [0, 8])),
      body('base', new THREE.BoxGeometry(40, 20, 40).translate(0, 10, 0)),
    ]);

    expect(candidates).toEqual([]);
    expect(faces).toEqual([expect.objectContaining({ part: 'horn', bore: false, radius: expect.closeTo(6, 1) })]);
  });
});
