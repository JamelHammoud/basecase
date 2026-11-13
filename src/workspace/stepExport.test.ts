import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { buildPartGroup } from '../three/buildPartMesh';
import { provideMeshFiles } from '../three/componentMeshes';
import type { ScenePart } from '../types/robotics';
import type { ExportedStep, StepJob } from '../types/step';
import { stepJob } from './stepExport';
import { exactSolid } from './stepSolids';
import { combinedPart } from './useSelectionOps';

interface OcctMesh {
  name: string;
  attributes: { position: { array: number[] } };
  brep_faces: unknown[];
}

interface OcctNode {
  name: string;
  meshes: number[];
  children: OcctNode[];
}

interface NodeKernel {
  renderPart: (language: string, code: string) => Promise<{ ok: boolean; positions: number[]; indices: number[] }>;
  exportStep: (job: StepJob) => Promise<unknown>;
  stopKernels: () => void;
}

interface Occt {
  ReadStepFile: (bytes: Uint8Array, params: unknown) => { success: boolean; meshes: OcctMesh[]; root: OcctNode };
}

const load = (name: string) => import(/* @vite-ignore */ name);
const repoFile = (file: string) => new URL(`../../${file}`, import.meta.url);
const { readFileSync } = (await load('node:fs')) as { readFileSync: (file: URL) => Uint8Array };
const { createNodeKernel } = await load(repoFile('electron/cad-kernel/nodeHost/client.mjs').href);
const { exportStepFile } = await load(repoFile('electron/cad-kernel/stepExport.mjs').href);
const occt = await ((await load('occt-import-js')) as { default: () => Promise<Occt> }).default();
const kernel: NodeKernel = createNodeKernel();

const SERVO = 'feetech-sts3215';
const BRACKET = `
let plate = drawRoundedRectangle(60, 30, 4).sketchOnPlane().extrude(4);
const wall = makeBox([-30, -15, 0], [-26, 15, 30]);
plate = plate.fuse(wall).fillet(1.5, (e) => e.inDirection('Y'));
for (const x of [-15, 0, 15]) plate = plate.cut(makeCylinder(1.7, 10, [x, 0, -2]));
return plate;`;
const READ = { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.01 };

afterAll(() => kernel.stopKernels());

async function bracketPart(): Promise<ScenePart> {
  const rendered = await kernel.renderPart('replicad', BRACKET);

  expect(rendered.ok).toBe(true);

  return specToPart({
    id: 'bracket',
    name: 'Bracket',
    shape: 'cad_part',
    group: 'Arm',
    position: [40, -20, 10],
    rotation: [0, 0, 30],
    cad: { language: 'replicad', code: BRACKET, positions: rendered.positions, indices: rendered.indices },
  });
}

function subtractedBox(): ScenePart {
  const plate = specToPart({ id: 'plate', name: 'Base Plate', shape: 'box', size: [80, 50, 6], position: [0, 0, 3] });
  const hole = specToPart({ id: 'hole', shape: 'hole_cylinder', size: [12, 12, 20], position: [10, 5, 3] });

  return combinedPart(plate, [hole], 'subtract')!;
}

function servoPart(): ScenePart {
  provideMeshFiles({
    [SERVO]: Uint8Array.from(readFileSync(repoFile(`public/parts/${SERVO}.glb`))).buffer,
  });

  return specToPart({
    id: 'servo',
    name: 'Shoulder Servo',
    catalog: `component:${SERVO}`,
    group: 'Arm',
    position: [-40, 30, 20],
    rotation: [90, 0, 45],
  });
}

function sceneBoxInStep(part: ScenePart) {
  const box = new THREE.Box3().setFromObject(buildPartGroup(part, false), true);

  return { min: [box.min.x, -box.max.z, box.min.y], max: [box.max.x, -box.min.z, box.max.y] };
}

function boundsOf(meshes: OcctMesh[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const p of meshes.map((m) => m.attributes.position.array))
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p[i + k]);
        max[k] = Math.max(max[k], p[i + k]);
      }

  return { min, max };
}

interface NamedMesh {
  name: string;
  groups: string[];
  mesh: OcctMesh;
}

function namedMeshes(node: OcctNode, meshes: OcctMesh[], outer: string[] = []): NamedMesh[] {
  const here = [...outer, node.name];
  const own = node.meshes.map((i) => ({ name: meshes[i].name || node.name, groups: here, mesh: meshes[i] }));

  return [...own, ...node.children.flatMap((child) => namedMeshes(child, meshes, here))];
}

function readBack(step: string) {
  const result = occt.ReadStepFile(new TextEncoder().encode(step), READ);

  expect(result.success).toBe(true);

  const named = namedMeshes(result.root, result.meshes);
  const names = [...new Set(named.map((m) => m.name))];

  return {
    bodies: names.map((name) => ({ name, meshes: named.filter((m) => m.name === name).map((m) => m.mesh) })),
    groupOf: (group: string) => [...new Set(named.filter((m) => m.groups.includes(group)).map((m) => m.name))].sort(),
  };
}

const expectNear = (actual: number[], expected: number[]) =>
  actual.forEach((v, k) => expect(Math.abs(v - expected[k]), `${actual} vs ${expected}`).toBeLessThan(0.1));

async function exported(parts: ScenePart[]): Promise<{ job: StepJob; left: number } & ExportedStep> {
  const { job, left } = await stepJob(parts, 'Test Arm');

  return { job, left, ...(await exportStepFile({ exportStep: kernel.exportStep }, job)) };
}

describe('STEP export', () => {
  it('writes a replicad bracket, a subtracted box and a catalog servo as named bodies at their scene bounds', async () => {
    const parts = [await bracketPart(), subtractedBox(), servoPart()];
    const { job, left, step, skipped } = await exported(parts);

    expect(job.bodies.map((b) => b.solid.type)).toEqual(['moved', 'moved', 'mesh']);
    expect([left, skipped]).toEqual([0, 0]);
    expect(step.startsWith('ISO-10303-21;')).toBe(true);

    const { bodies, groupOf } = readBack(step);

    expect(bodies.map((b) => b.name).sort()).toEqual(['Base Plate', 'Bracket', 'Shoulder Servo']);

    for (const part of parts) {
      const body = bodies.find((b) => b.name === part.name)!;
      const expected = sceneBoxInStep(part);
      const actual = boundsOf(body.meshes);

      expectNear(actual.min, expected.min);
      expectNear(actual.max, expected.max);
    }

    const [bracket] = bodies.find((b) => b.name === 'Bracket')!.meshes;

    expect(bracket.brep_faces.length * 10).toBeLessThan(parts[0].cad!.indices.length / 3);

    expect(groupOf('Arm')).toEqual(['Bracket', 'Shoulder Servo']);
  }, 120_000);

  it('builds every basic shape exactly where the scene draws it', async () => {
    const shapes: Array<[string, [number, number, number]]> = [
      ['box', [30, 20, 10]],
      ['cylinder', [30, 16, 40]],
      ['tube', [24, 24, 30]],
      ['sphere', [24, 24, 24]],
      ['cone', [20, 20, 30]],
      ['torus', [40, 40, 8]],
      ['capsule', [16, 16, 40]],
      ['dome', [30, 30, 15]],
    ];
    const parts = shapes.map(([shape, size], i) =>
      specToPart({ id: shape, name: shape, shape, size, position: [i * 60, 10, 20], rotation: [90, 0, 90 * (i % 2)] }),
    );
    const { job, step } = await exported(parts);
    const { bodies } = readBack(step);

    expect(job.bodies.every((b) => b.solid.type === 'moved' && !b.fallback?.type.includes('code'))).toBe(true);

    for (const part of parts) {
      const actual = boundsOf(bodies.find((b) => b.name === part.name)!.meshes);
      const expected = sceneBoxInStep(part);

      actual.min.forEach((v, k) =>
        expect(
          Math.abs(v - expected.min[k]),
          `${part.name} min ${actual.min} vs ${expected.min} max ${actual.max} vs ${expected.max}`,
        ).toBeLessThan(0.3),
      );
      actual.max.forEach((v, k) => expect(Math.abs(v - expected.max[k]), `${part.name} max`).toBeLessThan(0.3));
    }
  }, 120_000);

  it('rebuilds a subtracted box exactly only while it keeps the size it was made at', () => {
    const box = subtractedBox();

    expect(box.csg?.operands.map((o) => o.kind)).toEqual(['box', 'hole_cylinder']);
    expect(exactSolid(box)?.type).toBe('boolean');
    expect(exactSolid({ ...box, dimensions: { ...box.dimensions, width: box.dimensions.width + 5 } })).toBeNull();
    expect(exactSolid({ ...box, csg: undefined })).toBeNull();
  });

  it('leaves out what a CAD file has no body for, and counts a part it cannot build', async () => {
    const box = specToPart({ id: 'b', name: 'Block', shape: 'box', size: [10, 10, 10] });
    const parts: ScenePart[] = [
      box,
      { ...box, id: 'hidden', visible: false },
      { ...box, id: 'cut', role: 'cutout' },
      { ...box, id: 'img', kind: 'image_plane' },
      { ...box, id: 'empty', name: 'Empty', kind: 'mesh', mesh: { positions: [], indices: [], baseSize: [1, 1, 1] } },
    ];
    const { job, left } = await stepJob(parts, 'Scene');

    expect(job.bodies.map((b) => b.name)).toEqual(['Block']);
    expect(left).toBe(1);
  });
});
