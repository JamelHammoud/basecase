import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { applySpec } from '../../agent/agentScene';
import { planMate } from '../../agent/mate';
import { findPort, worldPort } from '../../agent/ports';
import { toScene } from '../../agent/agentFrame';
import { buildPartGroup, releasePartGroup } from '../../three/buildPartMesh';
import { measureTriangles } from '../../three/meshMeasure';
import type { ScenePart, RobotJoint } from '../../types/robotics';
import { DEFAULT_PROJECT } from '../../types/robotics';
import type { RenderedCad } from '../platform/types';
import { prepareParameterEdit } from './transaction';
import { regenerateParameterGeometry } from './geometry';
import { mechanismFixture, PARAMETER_MECHANISMS } from './mechanisms.fixtures';
import { partSoup } from '../sketch/fixtures/supportDesigns';
import { partPlane } from '../sketch/placement';
import { rememberParameterDesign, parameterDesignStatus } from './verification';
import { rememberSupport } from '../sketch/supportVerified';
import { buildBom } from '../bom';
import { readinessOf, readinessFingerprint, currentReadiness } from '../../readiness/readiness';
import { ruleFinding } from '../../readiness/wording';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../../workspace/docHistory';
import { encodeSceneFile, decodeSceneFile } from '../sceneFile';
import { fallsKey, walkKey } from '../../workspace/storedWalk';
import { buildMjcf } from '../../sim/mjcf';
import { buildRig } from '../kinematics';
import { isStalePolicy, modelFingerprints } from '../../sim/policyFreshness';
import { SIM_MODEL_VERSION } from '../../sim/mjcfTypes';

interface Kernel {
  renderPart: (language: string, code: string, options?: { expect?: Record<string, unknown> }) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(
  new URL('../../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href,
);
const kernel: Kernel = createNodeKernel();
const compile = (part: ScenePart, code: string) => kernel.renderPart('openscad', code, { expect: part.cad?.expect });
const regenerate = async (job: Parameters<typeof regenerateParameterGeometry>[0]) =>
  structuredClone(regenerateParameterGeometry(structuredClone(job)));

afterAll(() => kernel.stopKernels());

function holes(part: ScenePart, centers: number[][]) {
  const group = buildPartGroup({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false);
  const ray = new THREE.Raycaster();

  group.updateMatrixWorld(true);

  for (const [x, y] of centers) {
    const point = toScene([x, y, 200]).map((value, index) => value - part.cad!.originOffset[index]);

    ray.set(new THREE.Vector3(...point), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(group, true).filter((hit) => (hit.object as THREE.Mesh).isMesh)).toEqual([]);
    ray.set(new THREE.Vector3(point[0] + 3, point[1], point[2]), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(group, true).filter((hit) => (hit.object as THREE.Mesh).isMesh).length).toBeGreaterThan(
      0,
    );
  }

  releasePartGroup(group);
}

function stock(parts: ScenePart[]) {
  return buildBom({ parts, project: DEFAULT_PROJECT, purchases: {}, measures: {} })
    .lines.filter((line) => line.category === 'Components' || line.category === 'Hardware')
    .map(({ key, qty, partIds }) => ({ key, qty, partIds }));
}

function assertSketchHole(part: ScenePart) {
  const circle = part.sketch!.sketch.entities.find((entity) => entity.kind === 'circle')!;

  if (circle.kind !== 'circle') throw new Error('Missing mounting circle');

  const center = part.sketch!.sketch.points.find((point) => point.id === circle.c)!;
  const plane = partPlane(part);
  const origin = new THREE.Vector3(...plane.origin)
    .addScaledVector(new THREE.Vector3(...plane.u), center.x)
    .addScaledVector(new THREE.Vector3(...plane.v), center.y)
    .addScaledVector(new THREE.Vector3(...plane.n), 100);
  const group = buildPartGroup(part, false);
  const ray = new THREE.Raycaster(origin, new THREE.Vector3(...plane.n).negate());

  group.updateMatrixWorld(true);
  expect(circle.r).toBeCloseTo(2.5, 5);
  expect(ray.intersectObject(group, true).filter((hit) => (hit.object as THREE.Mesh).isMesh)).toEqual([]);
  expect(measureTriangles(partSoup(part)).volumeMm3).toBeCloseTo((200 - Math.PI * 2.5 ** 2) * 3, -1);
  releasePartGroup(group);
}

async function preparedFixture(index: number) {
  const fixture = mechanismFixture(index);
  const initial = await prepareParameterEdit(fixture, { compile, regenerate, verify: true, isCurrent: () => true });
  const plan = planMate(initial.parts, {
    part: 'mount',
    port: 'bottom',
    target: 'source',
    targetPort: 'mount',
    type: 'face',
  });

  if (typeof plan === 'string' || plan.op.op !== 'update') throw new Error(String(plan));

  const operation = plan.op.part;
  const parts = initial.parts.map((part) => (part.id === 'mount' ? applySpec(part, operation) : part));

  rememberParameterDesign(parts, fixture.parameters);
  parts.forEach((part) => rememberSupport(part.sketch));

  return { ...fixture, parts };
}

function assertPolicyFreshness(before: ScenePart[], after: ScenePart[]) {
  const joint: RobotJoint = {
    id: 'mount',
    name: 'Mount',
    type: 'revolute',
    actuation: 'passive',
    parent: ['source'],
    child: ['mount'],
    origin: [0, 0, 0],
    axis: [0, 1, 0],
    range: [-45, 45],
  };
  const project = { ...DEFAULT_PROJECT, joints: [joint] };
  const model = (parts: ScenePart[]) =>
    buildMjcf({
      parts,
      project,
      rig: buildRig(project.joints, parts),
      measures: {},
      partTriangles: (id) => partSoup(parts.find((part) => part.id === id)!),
    });
  const baseline = model(before);
  const current = model(after);

  expect(baseline.robots.length).toBeGreaterThan(0);
  expect(
    isStalePolicy(
      { robot: baseline.robots[0].key, fingerprint: baseline.robots[0].fingerprint, modelVersion: SIM_MODEL_VERSION },
      modelFingerprints(current),
    ),
  ).toBe(true);
}

describe('ten editable robot assemblies through production regeneration', () => {
  it.each(PARAMETER_MECHANISMS.map((design, index) => ({ ...design, index })))(
    '$name keeps dimensions, holes, connected references and purchasing identities coherent',
    async ({ index, after: width, mount, centers, servos, screws }) => {
      const before = await preparedFixture(index);
      const parameters = [
        { name: 'span', unit: 'mm' as const, value: width },
        { name: 'clearance', unit: 'mm' as const, value: 2.5 },
      ];
      const result = await prepareParameterEdit(
        { parts: before.parts, parameters },
        { compile, regenerate, isCurrent: () => true },
      );
      const [source, companion, rail, feature] = result.parts;

      rememberParameterDesign(result.parts, parameters);
      result.parts.forEach((part) => rememberSupport(part.sketch));
      expect(result.metrics.compiled).toBe(2);
      expect(source.dimensions.width).toBeCloseTo(width, 3);
      expect(companion.dimensions.width).toBeCloseTo(mount, 3);
      expect(rail.dimensions.width).toBe(width);
      holes(source, centers);
      holes(companion, centers);
      assertSketchHole(feature);
      expect(feature.sketch!.support!.partId).toBe('rail');
      expect(feature.position[0] - before.parts[3].position[0]).toBeCloseTo(-10, 4);
      expect(worldPort(source, findPort(source, 'mount')!).position).toEqual(
        worldPort(companion, findPort(companion, 'bottom')!).position,
      );
      expect(companion.mates).toEqual(before.parts[1].mates);
      expect(stock(result.parts)).toEqual(stock(before.parts));
      expect(
        result.parts.filter((part) => part.componentId === 'feetech-sts3215' && part.componentVariant === 'c018'),
      ).toHaveLength(servos);
      expect(result.parts.filter((part) => part.hardware)).toHaveLength(screws);

      for (let i = 4; i < result.parts.length; i++) expect(result.parts[i]).toBe(before.parts[i]);

      const originalProject = { ...DEFAULT_PROJECT, designParameters: before.parameters };
      const project = { ...DEFAULT_PROJECT, designParameters: parameters };
      const doc = pushHistory(docFromParts(before.parts), result.parts, trackedOf(originalProject));
      const undo = travelProject(doc, project, { direction: 'undo' })!;
      const redo = travelProject(undo.doc, undo.project, { direction: 'redo' })!;

      expect(undo.doc.parts).toBe(before.parts);
      expect(undo.project.designParameters).toBe(before.parameters);
      expect(redo.doc.parts).toBe(result.parts);
      expect(redo.project.designParameters).toBe(parameters);

      const saved = await decodeSceneFile(
        await encodeSceneFile({
          name: before.design.name,
          parts: result.parts,
          project,
          globalGoal: '',
          annotations: [],
        }),
      );

      expect(JSON.stringify(saved.parts)).toBe(JSON.stringify(result.parts));
      expect(parameterDesignStatus(saved.parts, saved.project!.designParameters).state).toBe('pending');

      const oldKey = readinessFingerprint(before.parts, originalProject);
      const oldVerdict = readinessOf([], {
        parts: before.parts,
        designParameters: before.parameters,
        fingerprint: oldKey,
      });

      expect(currentReadiness(oldVerdict, readinessFingerprint(result.parts, project))).toBeNull();
      expect(readinessFingerprint(result.parts, project)).not.toBe(readinessFingerprint(before.parts, originalProject));
      expect(walkKey(result.parts, project)).not.toBe(walkKey(before.parts, originalProject));
      expect(fallsKey(result.parts, project)).not.toBe(fallsKey(before.parts, originalProject));
      expect(
        readinessOf(
          [ruleFinding('unheld', 'blocker', { ids: ['rail'], subject: 'rail', agentText: 'Attach the support rail.' })],
          {
            parts: result.parts,
            designParameters: parameters,
            fingerprint: '',
          },
        ).status,
      ).toBe('blocked');
      assertPolicyFreshness(before.parts, result.parts);
      process.stdout.write(`parameter-assembly ${JSON.stringify({ name: before.design.name, ...result.metrics })}\n`);
    },
  );
});
