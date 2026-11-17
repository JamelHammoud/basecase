import { BoxGeometry, Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { component, sceneOf } from './fixtures';
import type { ElectronicsBoard } from './boardTypes';
import { analyzeBoardGeometry, boardGeometryKey } from './boardGeometry';

const definition: ElectronicsBoard = {
  schema: 1,
  partId: 'board',
  outline: 'rectangle',
  side: 'top',
  heightMm: { top: 20, bottom: 5 },
  edgeClearanceMm: 1,
  holes: [],
  keepouts: [],
  placements: [],
};

function fixture() {
  const board = box('board', [0, 10, 0], [40, 1.6, 30], 5);
  const wall = box('wall', [0, 0, 0], [80, 2, 60], 5);
  const scene = sceneOf([board, wall], []);

  return { ...scene, project: { ...scene.project, electronicsBoard: structuredClone(definition) } };
}

function geometry(scene: ReturnType<typeof fixture>) {
  const triangles = Object.fromEntries(
    scene.parts.map((part) => {
      const shape = new BoxGeometry(
        part.dimensions.width,
        part.dimensions.height,
        part.dimensions.depth,
      ).toNonIndexed();
      const array = shape.getAttribute('position').array as Float32Array;

      shape.dispose();

      return [part.id, array];
    }),
  );

  return { key: boardGeometryKey(scene), triangles };
}

describe('board geometry analysis', () => {
  it('blocks inaccessible plugs even though generic assembly owns only source parts', () => {
    const scene = fixture();
    const servo = { ...component('xl', 'dynamixel-xl330-m288'), position: [100, 0, 0] as [number, number, number] };

    scene.parts.push(servo);
    scene.project.electronicsBoard.placements.push({
      id: 'connector',
      productId: 'jst-b3b-eh-a',
      position: [0, 0],
      rotation: 0,
      locked: true,
      bindings: ['1', '2', '3'].map((pin) => ({ pad: pin, partId: servo.id, port: 'bus-in', pin })),
    });
    scene.parts[1].position = [2.5, 22, 0];
    scene.parts[1].dimensions = { width: 4, height: 2, depth: 4 };

    expect(analyzeBoardGeometry(scene, geometry(scene)).requirements.map((item) => item.code)).toContain(
      'board-collision',
    );
    scene.parts[1].position[1] = 35;
    expect(analyzeBoardGeometry(scene, geometry(scene)).requirements).toEqual([]);
  });

  it('uses surfaces and containment rather than the enclosure bounding box as free space', () => {
    const scene = fixture();
    const prepared = geometry(scene);

    expect(analyzeBoardGeometry(scene, prepared).requirements).toEqual([]);
    scene.parts[1].position = [0, 10, 0];
    expect(analyzeBoardGeometry(scene, geometry(scene)).requirements.map((item) => item.code)).toContain(
      'board-collision',
    );
  });

  it('detects a board wholly contained in an obstacle', () => {
    const scene = fixture();

    scene.parts[1].position = [0, 10, 0];
    scene.parts[1].dimensions.height = 30;
    expect(analyzeBoardGeometry(scene, geometry(scene)).requirements.map((item) => item.code)).toContain(
      'board-collision',
    );
  });

  it('preserves the explicit local frame under scene rotation and translation', () => {
    const scene = fixture();
    const before = analyzeBoardGeometry(scene, geometry(scene));

    for (const part of scene.parts) {
      const transformed = new Matrix4().makeRotationY(Math.PI / 2);
      const point = transformed.elements;
      const [x, y, z] = part.position;

      part.position = [x * point[0] + z * point[8] + 100, y + 50, x * point[2] + z * point[10] - 80];
      part.rotation = [0, 90, 0];
    }

    expect(analyzeBoardGeometry(scene, geometry(scene)).requirements).toEqual(before.requirements);
  });

  it.each(['position', 'dimensions', 'holes'] as const)('refuses stale %s geometry', (change) => {
    const scene = fixture();
    const prepared = geometry(scene);

    if (change === 'position') scene.parts[1].position[0] = 1;

    if (change === 'dimensions') scene.parts[1].dimensions.height = 10;

    if (change === 'holes')
      scene.project.electronicsBoard.holes.push({ id: 'h', position: [0, 0], diameterMm: 3, keepoutMm: 2 });

    expect(analyzeBoardGeometry(scene, prepared).requirements.map((item) => item.code)).toContain(
      'board-stale-geometry',
    );
  });

  it('keeps missing, malformed and unbounded geometry unresolved', () => {
    const scene = fixture();
    const prepared = geometry(scene);

    delete prepared.triangles.wall;
    expect(analyzeBoardGeometry(scene, prepared).requirements.map((item) => item.code)).toContain('board-geometry');
    prepared.triangles.wall = new Float32Array([NaN, 0, 0]);
    expect(analyzeBoardGeometry(scene, prepared).requirements.map((item) => item.code)).toContain('board-geometry');
  });
});
