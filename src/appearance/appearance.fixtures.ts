import { SHEET_MATERIALS } from '../sheet/materials';
import { base64ToBytes } from '../utils/base64';
import * as THREE from 'three';
import { box } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { RobotJoint, ScenePart } from '../types/robotics';

function enclosure(): ScenePart[] {
  return [box('enclosure-base', [0, 2, 0], [100, 4, 70], 40), box('transparent-cover', [0, 30, 0], [100, 2, 70], 12)];
}

function cameraAssembly(): ScenePart[] {
  return [
    box('camera-pedestal', [0, 20, 0], [30, 40, 30], 20),
    { ...box('camera', [0, 48, 0], [25, 12, 24], 3), kind: 'component', componentId: 'raspberry-pi-camera-3' },
  ];
}

function mixedAssembly(): ScenePart[] {
  const geometry = new THREE.BoxGeometry(30, 20, 10).toNonIndexed();
  const positions = Array.from(geometry.getAttribute('position').array);
  const uvs = Array.from(geometry.getAttribute('uv').array);

  geometry.dispose();

  return [
    {
      ...box('imported-panel', [0, 20, 0], [30, 20, 10], 8),
      kind: 'mesh',
      mesh: {
        positions,
        indices: Array.from({ length: positions.length / 3 }, (_, index) => index),
        baseSize: [30, 20, 10],
        uvs,
      },
    },
    {
      ...box('custom-cover', [40, 20, 0], [30, 40, 10], 12),
      kind: 'custom_model',
      customNodes: [
        {
          id: 'cover',
          name: 'cover',
          nodeType: 'primitive',
          primitiveKind: 'box',
          role: 'solid',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          dimensions: { width: 30, height: 40, depth: 10 },
          color: '#888888',
        },
      ],
    },
  ];
}

export function appearanceDesign(index: number): { parts: ScenePart[]; joints: RobotJoint[] } {
  if (index === 3) return { parts: enclosure(), joints: [] };

  if (index === 7) return { parts: cameraAssembly(), joints: [] };

  if (index === 9) return { parts: mixedAssembly(), joints: [] };

  const robot = fixtureRobots()[[7, 5, 0, 8, 3, 6, 7, 4, 2, 1][index]];

  if (index !== 6) return robot;

  return {
    ...robot,
    parts: robot.parts.map((part) =>
      part.id === 'body'
        ? {
            ...part,
            dimensions: { ...part.dimensions, height: 3 },
            mechanicalTag: 'Laser-Cut Acrylic/Carbon',
            massG: (part.dimensions.width * 3 * part.dimensions.depth * SHEET_MATERIALS['carbon-fiber'].density) / 1000,
            sheet: { material: 'carbon-fiber' as const, thicknessMm: 3 },
          }
        : part,
    ),
  };
}

export function appearanceMeshes(group: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  group.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });

  return meshes;
}

export function appearanceFinish(index: number, part: ScenePart): string {
  if (index === 2 && part.id.endsWith('lower')) return 'rubber';

  if (index === 3 && part.id.includes('cover')) return 'transparent';

  return ['matte', 'metal', 'matte', 'paint', 'paint', 'rubber', 'matte', 'paint', 'matte', 'paint'][index];
}

export const appearanceTextureBytes = () =>
  base64ToBytes(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQImWNQUFD4n5CQ8J8BRIA4ADp0Bv3Lp4L1AAAAAElFTkSuQmCC',
  );
