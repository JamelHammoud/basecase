import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { collide, place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { sweepClashes } from '../three/analysis/sweep';
import { hollowOf } from './hollow';
import { loadManifold, meshOfSolid, soupOfMesh } from './manifold';
import { armInput } from './wrap.fixtures';
import { fitMesh, subtreeOf, wrapRobot } from './wrapCore';
import { soupBounds } from './vec';
import { BASE_LINK, WALL_MM, type WrapInput, type WrapResult, type WrapShell } from './wrapTypes';

let input: WrapInput;
let result: WrapResult;

const SHELL = 'shell:';
const CLEAR_OF_PARTS_MM = 6;
const SLOW_MS = 60000;

beforeAll(async () => {
  input = armInput();
  result = wrapRobot(await loadManifold(), input);
}, 120000);

function nearest(soup: Float32Array) {
  const bvh = solidFromPositions(soup).bvh;

  return (p: THREE.Vector3, cap: number) => bvh.closestPointToPoint(p, undefined, 0, cap);
}

function innerWall(shell: WrapShell, toSource: ReturnType<typeof nearest>): Float32Array {
  const corner = (i: number) => new THREE.Vector3().fromArray(shell.positions, i * 3);
  const inner: number[] = [];

  for (let t = 0; t < shell.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => corner(shell.indices[t + k]));
    const middle = a.clone().add(b).add(c).divideScalar(3);
    const hit = toSource(middle, 3);
    const normal = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
    const facesHollow = hit && normal.dot(middle.clone().sub(hit.point).normalize()) > 0.7;

    if (facesHollow && Math.abs(hit.distance - WALL_MM) < 0.25)
      inner.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  }

  return new Float32Array(inner);
}

function thinnestWall(shell: WrapShell, source: Float32Array, apart: (p: THREE.Vector3) => boolean) {
  const toSource = nearest(source);
  const toInner = nearest(innerWall(shell, toSource));
  const v = new THREE.Vector3();
  let wall = Infinity;
  let outer = 0;

  for (let i = 0; i < shell.positions.length / 3; i++) {
    v.fromArray(shell.positions, i * 3);

    if ((toSource(v, 0.05)?.distance ?? 1) >= 0.05 || !apart(v)) continue;

    outer++;
    wall = Math.min(wall, toInner(v, 10)?.distance ?? 10);
  }

  return { wall, outer };
}

function placedScene(): Array<Placed & { link: string }> {
  const parts = [
    ...input.bodies.map((b) => ({ id: b.id, link: b.link, soup: b.soup })),
    ...result.shells.map((s) => ({ id: SHELL + s.link, link: s.link, soup: soupOfMesh(s) })),
  ];

  return parts.map((p) => ({ ...place(p.id, solidFromPositions(p.soup), new THREE.Matrix4()), link: p.link }));
}

const touchesShell = (hit: { a: string; b: string }) => hit.a.startsWith(SHELL) || hit.b.startsWith(SHELL);

describe('wrapRobot on a two-joint arm inside a capsule', () => {
  it('makes one shell per link', () => {
    expect(result.shells.map((s) => s.link).sort()).toEqual([BASE_LINK, 'elbow', 'shoulder'].sort());
    expect(result.shells.every((s) => s.indices.length > 0)).toBe(true);
  });

  it(
    'hollows the mesh to a wall of at least 1.8 mm',
    async () => {
      const api = await loadManifold();
      const robot = soupBounds(input.bodies.map((b) => b.soup))!;
      const source = fitMesh(input.mesh, robot).soup;
      const hollow = hollowOf(api, source, { wallMm: WALL_MM, edgeMm: 1.2 })!;
      const { wall, outer } = thinnestWall({ link: BASE_LINK, ...meshOfSolid(hollow) }, source, () => true);

      hollow.delete();
      expect(outer).toBeGreaterThan(100);
      expect(wall).toBeGreaterThanOrEqual(1.8);
    },
    SLOW_MS,
  );

  it(
    'keeps that wall on every shell away from the robot’s parts',
    () => {
      const robot = soupBounds(input.bodies.map((b) => b.soup))!;
      const source = fitMesh(input.mesh, robot).soup;
      const toBodies = nearest(Float32Array.from(input.bodies.flatMap((b) => Array.from(b.soup))));
      const apart = (p: THREE.Vector3) => toBodies(p, CLEAR_OF_PARTS_MM) === null;

      for (const shell of result.shells) {
        const { wall, outer } = thinnestWall(shell, source, apart);

        expect(outer, shell.link).toBeGreaterThan(20);
        expect(wall, shell.link).toBeGreaterThanOrEqual(1.8);
      }
    },
    SLOW_MS,
  );

  it(
    'leaves no shell inside a link at rest',
    () => {
      const { interferences } = collide(placedScene(), { toleranceMm: 0.3, maxSamples: 400 });

      expect(interferences.filter(touchesShell)).toEqual([]);
    },
    SLOW_MS,
  );

  it(
    'keeps every shell out of the other links across each joint’s full range',
    () => {
      const scene = placedScene();

      for (const joint of input.joints) {
        const moving = subtreeOf(joint, input.joints);
        const angles: number[] = [];

        for (let a = joint.range[0]; a <= joint.range[1]; a += 2.5) if (a !== 0) angles.push(a);

        const hits = sweepClashes(scene, {
          moving: scene.filter((p) => moving.has(p.link)).map((p) => p.id),
          origin: joint.origin,
          axis: joint.axis,
          anglesDeg: angles,
        });

        expect(hits.filter(touchesShell), joint.id).toEqual([]);
      }
    },
    SLOW_MS,
  );
});
