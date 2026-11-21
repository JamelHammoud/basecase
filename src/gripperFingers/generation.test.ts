import { afterAll, expect, it } from 'vitest';
import { fingerRayHits, fingerHullContains } from './geometryAssertions.fixtures';
import { mountCode, fingerCode, DEFAULT_MOUNT, DEFAULT_FINGER } from './cad';
import { readMount, readFinger } from './dimensions';
import { specToPart } from '../agent/agentScene';
import { partSoup } from '../utils/sketch/fixtures/supportDesigns';
import { measureTriangles } from '../three/meshMeasure';
import type { RenderedCad } from '../utils/platform/types';
import { fingerFixtures } from './fixtures';
import { generateFingers } from './generate';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import { buildRig } from '../utils/kinematics';
import { box } from '../sim/fixtures/parts';
import { fingerFrame } from './frames';
import { validateFingerAssembly } from './validation';
import { robotFacts } from '../cases/robotFit';

interface Kernel {
  renderPart: (language: string, code: string) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(new URL('../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href);
const kernel: Kernel = createNodeKernel();
const compile = (code: string) => kernel.renderPart('openscad', code);

afterAll(() => kernel.stopKernels());

it('compiles a captive-nut carriage and both finger profiles as editable watertight solids', async () => {
  for (const code of [mountCode(DEFAULT_MOUNT), fingerCode(DEFAULT_FINGER), fingerCode({ ...DEFAULT_FINGER, v: 1 })]) {
    const rendered = await compile(code);

    expect(rendered.ok, rendered.error).toBe(true);

    const part = specToPart({
      id: 'native',
      shape: 'cad_part',
      cad: { ...rendered, code, language: 'openscad', positions: rendered.positions!, indices: rendered.indices! },
    });

    expect(measureTriangles(partSoup(part)).volumeMm3).toBeGreaterThan(100);
    expect(readMount(part) ?? readFinger(part)).not.toBeNull();
    expect(fingerRayHits(part, [-100, -19, 0], [1, 0, 0])).toHaveLength(0);
    expect(fingerRayHits(part, [-100, -7, 0], [1, 0, 0])).toHaveLength(0);
    expect(fingerRayHits(part, [-100, -13, 3], [1, 0, 0]).length).toBeGreaterThan(0);

    if (readFinger(part)?.v === 1) {
      const generated = {
        ...part,
        gripperFinger: {
          version: 1 as const,
          role: 'finger' as const,
          mount: 'mount',
          joint: 'jaw',
          target: 'target',
          travel: [0, 22] as [number, number],
          axis: [1, 0, 0] as [number, number, number],
        },
      };

      expect(fingerHullContains(generated, [-0.75, 10, 0])).toBe(false);
      expect(fingerHullContains(generated, [-0.75, 10, 2])).toBe(true);
      expect(
        fingerRayHits(part, [1, 10, 0], [-1, 0, 0])[0] - fingerRayHits(part, [1, 10, 2], [-1, 0, 0])[0],
      ).toBeCloseTo(1, 2);
    }
  }
});

it('refuses thin walls, obstructed mounting holes and impossible mounting spacing in the native CAD path', async () => {
  for (const code of [
    fingerCode({ ...DEFAULT_FINGER, thickness: 1 }),
    fingerCode({ ...DEFAULT_FINGER, clearance: -1 }),
    mountCode({ ...DEFAULT_MOUNT, spacing: 24 }),
    mountCode({ ...DEFAULT_MOUNT, depth: 5 }),
  ]) {
    expect((await compile(code)).ok).toBe(false);
  }
});

it('generates both referenced fingers and stock fasteners without changing any joint, assignment or travel', async () => {
  const source = await fingerFixtures(compile);
  const target = selectedPickTargets()[0];
  const before = JSON.stringify(source);
  const result = await generateFingers(
    { ...source, target: target.id, parts: [...source.parts, target], style: 'flat' },
    { compile, current: () => true },
  );
  const fingers = result.parts.filter((part) => part.gripperFinger?.role === 'finger');

  expect(fingers).toHaveLength(2);
  expect(
    result.joints.map((joint) => ({ ...joint, child: source.joints.find((item) => item.id === joint.id)!.child })),
  ).toEqual(source.joints);
  expect(result.parts.filter((part) => part.gripperFinger?.role !== 'finger' && part.gripperFinger)).toHaveLength(12);
  expect(result.parameters.map((parameter) => parameter.name)).toContain('finger_length');
  expect(robotFacts(buildRig(result.joints, result.parts), result.parts).gripper?.jaws.map((jaw) => jaw.joint)).toEqual(
    ['finger_left', 'finger_right'],
  );
  expect(result.parts.find((part) => part.id === target.id)).toBe(target);
  expect(result.parts.find((part) => part.id === 'base')).toBe(source.parts.find((part) => part.id === 'base'));
  expect(JSON.stringify(source)).toBe(before);
  expect(() => validateFingerAssembly(result.parts, result.joints)).not.toThrow();

  const screw = result.parts.find((part) => part.gripperFinger?.role === 'screw')!;
  const finger = fingers[0];
  const changed = (replacement: typeof screw) =>
    result.parts.map((part) => (part.id === replacement.id ? replacement : part));
  const invalidAssemblies = [
    result.parts.filter((part) => part.id !== screw.id),
    result.parts.filter((part) => part.gripperFinger?.role !== 'finger'),
    changed({ ...screw, hardware: { ...screw.hardware!, length: 12 } }),
    changed({ ...screw, position: [1000, 1000, 1000] }),
    changed({ ...screw, role: 'reference' }),
    changed({ ...finger, position: [finger.position[0], finger.position[1], finger.position[2] + 10] }),
    changed({ ...finger, rotation: [0, 10, 0] }),
    changed({ ...finger, boolean: { op: 'subtract' as const, operands: [finger, target] } }),
  ];

  for (const parts of invalidAssemblies) expect(() => validateFingerAssembly(parts, result.joints)).toThrow();

  expect(() =>
    validateFingerAssembly(
      result.parts,
      result.joints.map((joint) => ({ ...joint, child: joint.child.filter((id) => id !== screw.id) })),
    ),
  ).toThrow();
});

it('refuses unsupported mounts, stale completion, cancellation, oversized targets and obstructed drivers without modifying the source', async () => {
  const source = await fingerFixtures(compile);
  const target = selectedPickTargets()[0];
  const input = { ...source, parts: [...source.parts, target], target: target.id, style: 'v' as const };
  const before = JSON.stringify(input);
  const controller = new AbortController();

  controller.abort();
  await expect(generateFingers(input, { compile, current: () => true, signal: controller.signal })).rejects.toThrow();
  await expect(generateFingers(input, { compile, current: () => false })).rejects.toThrow();
  await expect(
    generateFingers(
      {
        ...input,
        parts: input.parts.map((part) => (part.id === 'finger_left' ? { ...part, cad: undefined } : part)),
      },
      { compile, current: () => true },
    ),
  ).rejects.toThrow();

  const oversized = { ...target, dimensions: { ...target.dimensions, width: 100 } };

  await expect(
    generateFingers({ ...input, parts: [...source.parts, oversized] }, { compile, current: () => true }),
  ).rejects.toThrow();
  await expect(
    generateFingers(
      {
        ...input,
        joints: input.joints.map((joint) => (joint.id === 'finger_left' ? { ...joint, range: [0, 2] } : joint)),
      },
      { compile, current: () => true },
    ),
  ).rejects.toThrow();

  const mount = source.parts.find((part) => part.id === 'finger_left')!;
  const obstruction = box('driver-obstruction', fingerFrame(mount).at([-30, -13, 0]), [10, 10, 10], 20);

  await expect(
    generateFingers({ ...input, parts: [...input.parts, obstruction] }, { compile, current: () => true }),
  ).rejects.toThrow('driver');

  const swept = box('sweep-obstruction', fingerFrame(mount).at([-2, 10, 0]), [2, 5, 5], 20);

  await expect(
    generateFingers({ ...input, parts: [...input.parts, swept] }, { compile, current: () => true }),
  ).rejects.toThrow('travel');

  const collision = box('finger_left-finger', [2000, 10, 0], [10, 20, 10], 20);

  await expect(
    generateFingers({ ...input, parts: [...input.parts, collision] }, { compile, current: () => true }),
  ).rejects.toThrow('Rename');

  const axes = (axis: [number, number, number]) =>
    input.joints.map((joint) => (joint.id.startsWith('finger_') ? { ...joint, axis } : joint));

  await expect(
    generateFingers({ ...input, joints: axes([2, 2, 0]) }, { compile, current: () => true }),
  ).rejects.toThrow('Align');

  const result = await generateFingers({ ...input, joints: axes([3, 0, 0]) }, { compile, current: () => true });

  expect(result.joints.filter((joint) => joint.id.startsWith('finger_')).map((joint) => joint.axis)).toEqual([
    [3, 0, 0],
    [3, 0, 0],
  ]);
  expect(() =>
    validateFingerAssembly(
      result.parts,
      result.joints.map((joint) => (joint.id === 'finger_left' ? { ...joint, range: [0, 2] } : joint)),
    ),
  ).toThrow('travel');
  expect(() => fingerCode({ ...DEFAULT_FINGER, length: '1; import("secret.stl");' as unknown as number })).toThrow(
    'numeric',
  );
  expect(JSON.stringify(input)).toBe(before);
});
