import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, expect, it } from 'vitest';
import type { RenderedCad } from '../utils/platform/types';
import { DEFAULT_PROJECT } from '../types/robotics';
import { useSceneDocument, type SceneDocument } from '../workspace/useSceneDocument';
import { fingerFixtures } from './fixtures';
import { generateFingers } from './generate';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import { editParameterBatch } from '../utils/designParameters/edits';
import { prepareParameterEdit } from '../utils/designParameters/transaction';
import { regenerateParameterGeometry } from '../utils/designParameters/geometry';
import { readFinger, readMount } from './dimensions';
import { encodeSceneFile, decodeSceneFile } from '../utils/sceneFile';

interface Kernel {
  renderPart: (language: string, code: string) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(new URL('../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href);
const kernel: Kernel = createNodeKernel();
const compile = (code: string) => kernel.renderPart('openscad', code);

afterAll(() => kernel.stopKernels());

it('commits both fingers, mounting references and parameters atomically and retains complete edits through undo, redo and native reopening', async () => {
  const fixture = await fingerFixtures(compile);
  const target = selectedPickTargets()[5];
  const source = [...fixture.parts, target];
  let docs!: SceneDocument;

  function Harness() {
    docs = useSceneDocument({
      parts: source,
      project: { ...DEFAULT_PROJECT, joints: fixture.joints },
      sceneId: 'finger-test',
      sceneName: 'Fingers',
      globalGoal: '',
      annotations: [],
    });

    return null;
  }

  renderToString(createElement(Harness));

  const generated = await generateFingers(
    { ...fixture, parts: source, target: target.id, style: 'v' },
    { compile, current: () => true },
  );

  docs.commitParameters(generated.parts, generated.parameters, undefined, generated.joints);
  expect(docs.docRef.current.past).toHaveLength(1);

  const changed = editParameterBatch({ parts: generated.parts, parameters: generated.parameters }, [
    { op: 'delete', name: 'finger_thickness', resolution: 'freeze' },
    ...generated.parts
      .filter((part) => part.gripperFinger?.role === 'finger')
      .map((part) => ({ op: 'unbind' as const, part: part.id, kind: 'cad' as const, target: 'finger_thickness' })),
    { op: 'set', parameter: { name: 'finger_length', value: 35, unit: 'mm' } },
    { op: 'set', parameter: { name: 'finger_mount_spacing', value: 14, unit: 'mm' } },
  ]);
  const edited = await prepareParameterEdit(changed, {
    compile: (_part, code) => compile(code),
    regenerate: regenerateParameterGeometry,
    isCurrent: () => true,
  });

  expect(edited.parameters.some((parameter) => parameter.name === 'finger_thickness')).toBe(false);
  expect(
    edited.parts.filter((part) => part.gripperFinger?.role === 'finger').map((part) => readFinger(part)!.thickness),
  ).toEqual([4, 4]);
  docs.commitParameters(edited.parts, edited.parameters);
  expect(docs.docRef.current.past).toHaveLength(2);
  expect(
    docs.docRef.current.parts
      .filter((part) => part.gripperFinger?.role === 'finger')
      .map((part) => readFinger(part)!.length),
  ).toEqual([35, 35]);
  expect(docs.docRef.current.parts.filter((part) => readMount(part)).map((part) => readMount(part)!.spacing)).toEqual([
    14, 14,
  ]);
  expect(docs.docRef.current.parts.find((part) => part.gripperFinger?.role === 'screw')!.position).not.toEqual(
    generated.parts.find((part) => part.gripperFinger?.role === 'screw')!.position,
  );
  docs.travel({ direction: 'undo' }, () => {});
  expect(docs.docRef.current.parts).toEqual(generated.parts);
  docs.travel({ direction: 'undo' }, () => {});
  expect(docs.docRef.current.parts).toBe(source);
  expect(docs.projectRef.current.joints).toBe(fixture.joints);
  expect(docs.projectRef.current.designParameters).toBeUndefined();
  docs.travel({ direction: 'redo' }, () => {});
  docs.travel({ direction: 'redo' }, () => {});
  expect(docs.docRef.current.parts).toEqual(edited.parts);
  expect(docs.projectRef.current.joints).toEqual(generated.joints);

  const restored = await decodeSceneFile(
    await encodeSceneFile({
      name: 'Fingers',
      globalGoal: '',
      annotations: [],
      parts: docs.docRef.current.parts,
      project: docs.projectRef.current,
    }),
  );

  expect(restored.parts.filter((part) => part.gripperFinger)).toEqual(
    edited.parts.filter((part) => part.gripperFinger),
  );
  expect(restored.project!.designParameters).toEqual(edited.parameters);
});

it('rejects impossible parameter edits and late cancellation before publishing geometry', async () => {
  const fixture = await fingerFixtures(compile);
  const target = selectedPickTargets()[0];
  const generated = await generateFingers(
    { ...fixture, parts: [...fixture.parts, target], target: target.id, style: 'flat' },
    { compile, current: () => true },
  );
  const before = JSON.stringify(generated.parts);
  const invalid = editParameterBatch({ parts: generated.parts, parameters: generated.parameters }, [
    { op: 'set', parameter: { name: 'finger_thickness', value: 1, unit: 'mm' } },
  ]);

  await expect(
    prepareParameterEdit(invalid, {
      compile: (_part, code) => compile(code),
      regenerate: regenerateParameterGeometry,
      isCurrent: () => true,
    }),
  ).rejects.toThrow();

  const controller = new AbortController();

  await expect(
    generateFingers(
      { ...fixture, parts: [...fixture.parts, target], target: target.id, style: 'flat' },
      {
        compile: async (code) => {
          const rendered = await compile(code);

          controller.abort();

          return rendered;
        },
        current: () => true,
        signal: controller.signal,
      },
    ),
  ).rejects.toThrow();

  let current = true;

  await expect(
    generateFingers(
      { ...fixture, parts: [...fixture.parts, target], target: target.id, style: 'flat' },
      {
        compile: async (code) => {
          const result = await compile(code);

          current = false;

          return result;
        },
        current: () => current,
      },
    ),
  ).rejects.toThrow('changed');
  expect(JSON.stringify(generated.parts)).toBe(before);
});
