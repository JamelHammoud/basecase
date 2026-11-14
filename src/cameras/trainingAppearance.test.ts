import * as THREE from 'three';
import { expect, it } from 'vitest';
import { TrainingAppearance } from './trainingAppearance';

it('restores original floor and wall materials and lighting before ordinary camera frames resume', () => {
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight('#ffffff', 1.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshStandardMaterial());
  const wall = new THREE.Mesh(new THREE.BoxGeometry(400, 1000, 20), new THREE.MeshStandardMaterial());
  const originalFloor = floor.material;
  const originalWall = wall.material;
  const appearance = new TrainingAppearance();

  light.position.set(120, 220, 160);
  wall.userData.partId = 'wall';
  scene.add(light, floor, wall);
  appearance.apply(scene, floor, {
    light: { direction: [1, 0, 0], color: '#ffccaa', intensity: 0.8 },
    floor: { color: '#888888', texture: 'checker', scaleMm: 200 },
    wall: { color: '#cccccc', texture: 'stripes', scaleMm: 100 },
    wallPartIds: ['wall'],
    noise: 0.01,
  });
  expect(floor.material).not.toBe(originalFloor);
  expect(wall.material).not.toBe(originalWall);
  expect(light.intensity).toBeCloseTo(0.8);

  appearance.clear();

  expect(floor.material).toBe(originalFloor);
  expect(wall.material).toBe(originalWall);
  expect(light.position.toArray()).toEqual([120, 220, 160]);
  expect(light.color.getHex()).toBe(0xffffff);
  expect(light.intensity).toBeCloseTo(1.6);
  appearance.clear();
});
