import * as THREE from 'three';
import { resolvePrinter } from '../data/printers';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { bedOf } from './bed';
import { buildPrintPlan } from './plan';
import { planInput } from './plan.fixtures';

export const projectPrinter = resolvePrinter('bambu-lab-p1s', []);

export const roverParts = (): ScenePart[] =>
  [
    { id: 'body', name: 'Rover body', printMaterial: 'PLA' as const, color: '#EEEEEE' },
    { id: 'tire', name: 'Rover tire', printMaterial: 'TPU' as const, color: '#333333' },
  ].map((p) => ({
    ...p,
    kind: 'box',
    category: 'primitives',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 20, height: 20, depth: 20 },
    note: '',
    mechanicalTag: `3D Printed ${p.printMaterial}`,
    visible: true,
    locked: false,
  }));

export function roverPlan() {
  return buildPrintPlan(
    [
      planInput('body', [20, 20, 20], {
        name: 'Rover body',
        print: { plate: 1, at: [30, 40], down: [1, 0, 0], turned: true },
      }),
      planInput('tire', [20, 20, 20], { material: 'TPU', name: 'Rover tire', print: { copies: 4 } }),
    ],
    projectPrinter,
    bedOf(projectPrinter.model),
    JSON.stringify(DEFAULT_PROJECT),
  );
}

export const roverShapes = (parts = roverParts()) =>
  snapshotShapes(
    parts.map((p) => ({
      id: p.id,
      object: new THREE.Mesh(
        new THREE.BoxGeometry(p.dimensions.width, p.dimensions.height, p.dimensions.depth).translate(
          p.dimensions.width / 2,
          p.dimensions.height / 2,
          p.dimensions.depth / 2,
        ),
      ),
    })),
  );
