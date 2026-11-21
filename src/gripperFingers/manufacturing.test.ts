import { afterAll, beforeAll, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import type { RenderedCad } from '../utils/platform/types';
import { fingerFixtures } from './fixtures';
import { generateFingers } from './generate';
import { selectedPickTargets } from '../cases/selectedPick.fixtures';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { fingerKitJob } from './manufacturing.fixtures';
import { buildKit, kitManifest } from '../kit/buildKit';
import { fingerTargetFixture } from './physics.fixtures';
import { hardwareKey } from '../utils/bom';

interface Kernel {
  renderPart: (language: string, code: string) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(new URL('../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href);
const kernel: Kernel = createNodeKernel();
const compile = (code: string) => kernel.renderPart('openscad', code);
let standard: FixtureRobot;
let alternate: FixtureRobot;

beforeAll(async () => {
  standard = await fingerFixtures(compile);
  alternate = await fingerFixtures(compile, { height: 28, depth: 24, spacing: 14 }, 21);
});
afterAll(() => kernel.stopKernels());

it.each(
  selectedPickTargets().map((target, index) => ({
    target,
    index,
    style: index % 2 ? ('v' as const) : ('flat' as const),
    name: target.id,
  })),
)('reconciles $name finger identities and quantities through Print and Kit', async ({ target, style, index }) => {
  const fixture = fingerTargetFixture(index % 2 ? alternate : standard, target, index % 3 === 0 ? 30 : 0);
  const generated = await generateFingers({ ...fixture, target: target.id, style }, { compile, current: () => true });
  const mounts = new Set(generated.parts.filter((part) => part.gripperFinger).map((part) => part.gripperFinger!.mount));
  const attachments = generated.parts.filter((part) => part.gripperFinger || mounts.has(part.id));
  const job = await fingerKitJob(attachments, generated.parameters);
  const manifest = kitManifest(job);
  const archive = unzipSync(await buildKit(job));
  const fingers = attachments.filter((part) => part.gripperFinger?.role === 'finger');

  for (const finger of fingers) {
    const printed = manifest.printed.find((part) => part.id === finger.id)!;

    expect(printed.outputs).toHaveLength(1);

    const packed = manifest.packing.filter((row) => row.partIds.includes(finger.id));

    expect(packed.flatMap((row) => row.partIds).filter((id) => id === finger.id)).toHaveLength(1);
    expect(packed.every((row) => row.qty === row.partIds.length)).toBe(true);

    const plate = unzipSync(archive[`plates/${printed.outputs[0].file}`]);

    expect(strFromU8(plate['3D/3dmodel.model'])).toContain(finger.name);
  }

  for (const type of ['socket_head', 'washer', 'hex_nut']) {
    const hardware = attachments.find((part) => part.hardware?.type === type)!;

    expect(manifest.purchases.find((line) => line.key === hardwareKey(hardware.hardware!))?.qty).toBe(4);
  }

  expect(manifest.printed.filter((part) => fingers.some((finger) => finger.id === part.id))).toHaveLength(2);
});
