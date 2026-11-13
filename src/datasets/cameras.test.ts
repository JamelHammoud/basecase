import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { datasetCameras, horizontalFovOf, partCameras, placeCamera, snakeKey, verticalFov } from './cameras';

const part = (o: Partial<ScenePart> & { id: string }): ScenePart => ({
  name: o.id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const piCamera = (o: Partial<ScenePart> = {}) =>
  part({
    id: 'cam',
    name: 'Wrist Camera',
    kind: 'component',
    componentId: 'raspberry-pi-camera-3',
    position: [100, 200, 0],
    dimensions: { width: 25, height: 12, depth: 24 },
    ...o,
  });

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 3));

describe('dataset cameras', () => {
  it('puts a camera part’s view at its lens, looking along the lens axis', () => {
    const [camera] = partCameras([piCamera(), part({ id: 'plate' })]);

    expect(camera.key).toBe('wrist_camera');
    expect(camera.part).toBe('cam');
    close(camera.position, [102.47, 194.88, 0]);
    close(camera.target, [102.47, 94.88, 0]);
    expect(Math.abs(new THREE.Vector3(...camera.up).y)).toBeLessThan(0.01);
  });

  it('turns with the part', () => {
    const [camera] = partCameras([piCamera({ rotation: [0, 0, 90] })]);
    const look = new THREE.Vector3(...camera.target).sub(new THREE.Vector3(...camera.position)).normalize();

    expect(look.x).toBeCloseTo(1, 3);
    expect(look.y).toBeCloseTo(0, 3);
  });

  it('reads the field of view from the catalog', () => {
    expect(horizontalFovOf(piCamera())).toBe(66);
    expect(horizontalFovOf(part({ id: 'x' }))).toBe(70);
    expect(verticalFov(66)).toBeLessThan(66);
    expect(verticalFov(200)).toBeCloseTo(verticalFov(120), 6);
  });

  it('always adds a fixed scene camera first, with unique keys', () => {
    const cameras = datasetCameras([piCamera(), piCamera({ id: 'cam2' }), part({ id: 'base' })], []);

    expect(cameras.map((c) => c.key)).toEqual(['scene', 'wrist_camera', 'wrist_camera_2']);
    expect(cameras[0].part).toBeNull();
  });

  it('rides on its body in the sim', () => {
    const [camera] = partCameras([piCamera()]);
    const delta = new THREE.Matrix4().makeTranslation(0, 0, 50);
    const placed = placeCamera(camera, delta);

    close(placed.position, [102.47, 194.88, 50]);
    expect(placeCamera(camera, undefined).position).toEqual(camera.position);
  });

  it('makes keys a dataset can use', () => {
    expect(snakeKey('Front Cam (OAK-D)')).toBe('front_cam_oak_d');
    expect(snakeKey('***')).toBe('camera');
  });
});
