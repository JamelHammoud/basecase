import { bodySourceKey } from '../reality/bodyEvidence';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { componentMeshesReady, provideMeshFiles } from '../three/componentMeshes';
import { textureAsset, textureAssetHash } from './textureAsset';
import { registerWorldAsset } from '../cases/worldAssets';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { buildBom } from '../utils/bom';
import { robotWeight } from '../utils/engineering';
import { buildMjcf } from '../sim/mjcf';
import { buildRig } from '../utils/kinematics';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { appearanceDesign, appearanceMeshes, appearanceFinish, appearanceTextureBytes } from './appearance.fixtures';
import { DEFAULT_PROJECT } from '../types/robotics';
import { studyFingerprint } from '../study/study';
import { buildPartGroup, releasePartGroup } from '../three/buildPartMesh';
import { readinessFingerprint } from '../readiness/readiness';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';
import { sceneJson } from '../utils/sceneJson';
import { finishAppearance } from './model';
import { validAppearance } from './validation';

const designs = [
  'Printed rover',
  'Metal arm',
  'Rubber quadruped',
  'Transparent enclosure',
  'Painted humanoid',
  'Textured gripper',
  'Carbon chassis',
  'Camera assembly',
  'Repeated hexapod',
  'Mixed assembly',
];

let textureHash = '';
const sceneMetrics: Array<{ design: string; bytes: number; parts: number }> = [];

beforeAll(async () => {
  const bytes = await readFile('public/parts/raspberry-pi-camera-3.glb');

  provideMeshFiles({ 'raspberry-pi-camera-3': Uint8Array.from(bytes).buffer });
  expect(await componentMeshesReady(['raspberry-pi-camera-3'])).toEqual([]);

  const asset = textureAsset(appearanceTextureBytes());

  textureHash = await textureAssetHash(asset);
  registerWorldAsset(textureHash, asset);
});

describe('persistent visual finishes', () => {
  it.each(designs.map((name, index) => ({ name, index })))(
    'retains identity and engineering declarations for $name',
    async ({ name, index }) => {
      const robot = appearanceDesign(index);
      const legacy = robot.parts.map((part) => ({
        ...part,
        mechanicalTag: part.mechanicalTag ?? (part.componentId ? 'Off-the-shelf COTS' : '3D Printed PLA/PETG'),
      }));
      const parts = legacy.map((part) => ({
        ...part,
        appearance: {
          ...finishAppearance(appearanceFinish(index, part), part.color),
          ...([5, 6].includes(index) ? { textures: { baseColor: textureHash } } : {}),
        },
      }));
      const project = { ...DEFAULT_PROJECT, joints: robot.joints };
      const measures = fixtureMeasures(legacy);
      const physical = (parts: typeof legacy) => ({ parts, project, measures });
      const bom = (parts: typeof legacy) =>
        buildBom({ ...physical(parts), purchases: {}, now: new Date('2026-11-20') });
      const model = (parts: typeof legacy) =>
        buildMjcf({ ...physical(parts), rig: buildRig(robot.joints, parts), partTriangles: fixtureTriangles(legacy) });

      expect(robotWeight(physical(parts)).all).toEqual(robotWeight(physical(legacy)).all);
      expect(bom(parts)).toEqual(bom(legacy));
      expect(model(parts).joints).toEqual(model(legacy).joints);
      expect(model(parts).robots.map((robot) => robot.fingerprint)).toEqual(
        model(legacy).robots.map((robot) => robot.fingerprint),
      );

      const scene = sharedScene({ name, globalGoal: '', parts, project });

      expect(readinessFingerprint(parts, {})).toBe(readinessFingerprint(legacy, {}));

      const bytes = await encodeSceneFile(scene);
      const reopened = await decodeSceneFile(bytes);

      sceneMetrics.push({ design: name, bytes: bytes.byteLength, parts: parts.length });
      await mkdir('scratch', { recursive: true });
      await writeFile('scratch/appearance-scene-metrics.json', JSON.stringify(sceneMetrics));

      const ordinary = JSON.parse(await sceneJson({ name, parts }));

      expect(reopened.parts).toEqual(parts);
      expect(ordinary.parts).toEqual(parts);
      expect(reopened.project?.joints).toEqual(robot.joints);
      expect(studyFingerprint(parts, project)).toBe(studyFingerprint(legacy, project));
      expect(studyFingerprint(parts, project, true)).not.toBe(studyFingerprint(legacy, project, true));

      for (const part of reopened.parts) {
        const group = buildPartGroup(part, false);
        const meshes = appearanceMeshes(group);

        expect(meshes.length).toBeGreaterThan(0);

        for (const mesh of meshes) {
          const material = mesh.material as THREE.MeshStandardMaterial;

          expect(material.roughness).toBe(part.appearance!.roughness);
          expect(material.metalness).toBe(part.appearance!.metalness);
          expect(material.opacity).toBe(part.appearance!.opacity);
          expect(material.color.getHexString()).toBe(part.appearance!.baseColor.slice(1));
        }

        expect(part.mechanicalTag).toBe(legacy.find((source) => source.id === part.id)!.mechanicalTag);
        expect(part.massG).toBe(legacy.find((source) => source.id === part.id)!.massG);
        releasePartGroup(group);
      }
    },
  );

  it('refuses remote assets, unsupported mappings and nonfinite material values', () => {
    const appearance = finishAppearance('paint', '#123456');

    expect(validAppearance(appearance)).toBe(true);
    expect(validAppearance({ ...appearance, roughness: NaN })).toBe(false);
    expect(validAppearance({ ...appearance, metalness: 1.1 })).toBe(false);
    expect(validAppearance({ ...appearance, textures: { baseColor: 'https://example.com/a.png' } })).toBe(false);
    expect(validAppearance({ ...appearance, mapping: { kind: 'automatic' } })).toBe(false);
    expect(validAppearance({ ...appearance, mapping: { ...appearance.mapping, plane: ['xy'] } })).toBe(false);
  });
});

it('keeps untextured finishes on the standard shader program', () => {
  const part = appearanceDesign(0).parts[0];
  const group = buildPartGroup({ ...part, appearance: finishAppearance('paint', part.color) }, false);
  const standard = new THREE.MeshStandardMaterial();

  for (const mesh of appearanceMeshes(group)) {
    expect((mesh.material as THREE.MeshStandardMaterial).customProgramCacheKey()).toBe(
      standard.customProgramCacheKey(),
    );
  }

  releasePartGroup(group);
  standard.dispose();
});

it('preserves retained body evidence across visual edits while camera evidence changes', async () => {
  const design = appearanceDesign(0);
  const parts = design.parts.map((part) => ({ ...part, appearance: finishAppearance('rubber', '#123456') }));

  expect(await bodySourceKey(parts, DEFAULT_PROJECT)).toBe(await bodySourceKey(design.parts, DEFAULT_PROJECT));
  expect(await bodySourceKey([{ ...parts[0], massG: 999 }, ...parts.slice(1)], DEFAULT_PROJECT)).not.toBe(
    await bodySourceKey(parts, DEFAULT_PROJECT),
  );
});

it('excludes nested node finishes from physical evidence and includes them in camera evidence', () => {
  const root = appearanceDesign(0).parts[0];
  const child = { ...root, appearance: finishAppearance('paint', '#abcdef') };
  const node = {
    id: 'node-a',
    name: 'Node',
    nodeType: 'primitive' as const,
    role: 'solid' as const,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    dimensions: root.dimensions,
    color: root.color,
    part: root,
  };
  const before = [{ ...root, customNodes: [node] }];
  const after = [{ ...root, customNodes: [{ ...node, part: child }] }];

  expect(readinessFingerprint(before, {})).toBe(readinessFingerprint(after, {}));
  expect(studyFingerprint(before, DEFAULT_PROJECT, true)).not.toBe(studyFingerprint(after, DEFAULT_PROJECT, true));
});
