import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { interferenceIn, sweepsIn } from './analysisPool';
import { snapshotShapes } from './sceneShapes';

const AXIS_X = -12.5;

const plain = (g: THREE.BufferGeometry) => {
  const flat = g.index ? g.toNonIndexed() : g;

  flat.deleteAttribute('normal');
  flat.deleteAttribute('uv');

  return flat;
};

function horn() {
  const disc = new THREE.Shape().absarc(0, 0, 10, 0, Math.PI * 2, false);

  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2;

    disc.holes.push(new THREE.Path().absarc(7 * Math.cos(angle), 7 * Math.sin(angle), 1.6, 0, Math.PI * 2, true));
  }

  return new THREE.ExtrudeGeometry(disc, { depth: 3, bevelEnabled: false, curveSegments: 24 })
    .rotateX(-Math.PI / 2)
    .translate(AXIS_X, 17.5, 0);
}

const servo = (): Placed => ({
  id: 'servo',
  object: new THREE.Mesh(mergeGeometries([plain(new THREE.BoxGeometry(45, 35, 25)), plain(horn())])),
});

type Placed = { id: string; object: THREE.Object3D };

const part = (id: string, geometry: THREE.BufferGeometry, at: [number, number, number]): Placed => {
  const mesh = new THREE.Mesh(geometry);

  mesh.position.set(...at);

  return { id, object: mesh };
};

const screw = () => part('screw', new THREE.CylinderGeometry(1.4, 1.4, 4, 16), [AXIS_X + 7, 19.6, 0]);
const bracket = () => part('bracket', new THREE.BoxGeometry(24, 3, 24), [AXIS_X, 22, 0]);
const arm = () => part('arm', new THREE.BoxGeometry(2, 20, 6), [-26, 10, 0]);

const sweep = (objects: Placed[], actuators?: string[]) =>
  sweepsIn(snapshotShapes(objects), [
    { moving: objects.slice(1).map((o) => o.id), origin: [AXIS_X, 0, 0], axis: [0, 1, 0], anglesDeg: [45], actuators },
  ]).then(([hits]) => hits.map((h) => [h.a, h.b]));

describe('range-of-motion sweeps around a servo output', () => {
  it('turns the horn with the joint, so screws seated in it never meet their own servo', async () => {
    const scene = [servo(), bracket(), screw()];

    expect(await sweep(scene)).toEqual([['screw', 'servo']]);
    expect(await sweep(scene, ['servo'])).toEqual([]);
  });

  it('still finds a link swinging into the servo case', async () => {
    const [hits] = await sweepsIn(snapshotShapes([servo(), bracket(), screw(), arm()]), [
      {
        moving: ['bracket', 'screw', 'arm'],
        origin: [AXIS_X, 0, 0],
        axis: [0, 1, 0],
        anglesDeg: [180],
        actuators: ['servo'],
      },
    ]);

    expect(hits.map((h) => [h.a, h.b])).toEqual([['arm', 'servo']]);
  });

  it('leaves the horn with the parent when the servo body is the moving side', async () => {
    const [hits] = await sweepsIn(snapshotShapes([servo(), bracket(), screw()]), [
      { moving: ['servo'], origin: [AXIS_X, 0, 0], axis: [0, 1, 0], anglesDeg: [45], actuators: ['servo'] },
    ]);

    expect(hits.filter((h) => h.b !== 'floor')).toEqual([]);
  });
});

describe('posed checks around a servo output', () => {
  const turned = ({ id, object }: Placed, deg: number): Placed => {
    const pivot = new THREE.Group();

    object.position.x -= AXIS_X;
    pivot.add(object);
    pivot.position.set(AXIS_X, 0, 0);
    pivot.rotation.y = THREE.MathUtils.degToRad(deg);
    pivot.updateMatrixWorld(true);

    return { id, object: pivot };
  };
  const clashes = async (objects: Placed[], riders?: Record<string, string[]>) =>
    (await interferenceIn(snapshotShapes(objects), { toleranceMm: 0.3, maxSamples: 400, riders })).interferences
      .filter((f) => f.a === 'servo' || f.b === 'servo')
      .map((f) => [f.a, f.b].sort());

  it('tests parts riding the output against the servo case only', async () => {
    const scene = [servo(), turned(bracket(), 45), turned(screw(), 45)];

    expect(await clashes(scene)).toEqual([['screw', 'servo']]);
    expect(await clashes(scene, { servo: ['bracket', 'screw'] })).toEqual([]);
  });

  it('still finds a riding link that reaches the case', async () => {
    const scene = [servo(), turned(bracket(), 180), turned(arm(), 180)];

    expect(await clashes(scene, { servo: ['bracket', 'arm'] })).toEqual([['arm', 'servo']]);
  });
});
