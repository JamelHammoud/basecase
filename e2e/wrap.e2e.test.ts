import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings, RobotJoint } from '../src/types/robotics';
import { ROBOT_PRESETS } from '../src/utils/robotImport';
import { openApp, type App } from './harness';
import { roundedCubeGlb, so101Urdf, SO101_LINKS } from './wrapFixtures';

interface PartRow {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  group?: string;
}

interface Clash {
  a: string;
  b: string;
  depthMm: number;
  joint?: string;
}

interface Studio {
  parts: () => PartRow[];
  select: (ids: string[]) => void;
  sceneRecord: () => { project: ProjectSettings };
  poseTool: (kind: string, payload: Record<string, unknown>) => Promise<{ text: string }>;
  interference: () => Promise<{ interferences: Clash[] }>;
  rangeClashes: () => Promise<Clash[]>;
  setPose: (values: Record<string, number>) => void;
  posing: () => { deltas: Map<string, { elements: number[] }> };
}

const WRAP_MS = 240000;
const MESH_NAME = 'owl';

let app: App;

const parts = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.parts());
const joints = (): Promise<RobotJoint[]> =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord().project.joints ?? []);
const shellIds = async () => (await parts()).filter((p) => p.id.startsWith('shell-')).map((p) => p.id);
const touchesShell = (c: Clash) => c.a.startsWith('shell-') || c.b.startsWith('shell-');

async function dropMesh(name: string, bytes: Uint8Array) {
  await app.page.evaluate(
    ([file, b64]) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      const target = document.querySelector('main canvas') ?? document.querySelector('main')!;
      const box = target.getBoundingClientRect();
      const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };

      dataTransfer.items.add(new File([data], file, { type: 'model/gltf-binary' }));

      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...at }));
      }
    },
    [name, Buffer.from(bytes).toString('base64')] as const,
  );
}

async function wrapFromPalette() {
  const rows = await parts();
  const mesh = rows.find((p) => p.name === MESH_NAME)!;
  const robot = rows.filter((p) => p.group === 'SO-101 Arm');

  await app.page.evaluate(
    (ids) => (window as unknown as { __studio: Studio }).__studio.select(ids),
    [mesh.id, ...robot.map((p) => p.id)],
  );
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Wrap Robot');
  await app.page.keyboard.press('Enter');
}

beforeAll(async () => {
  app = await openApp();

  const so101 = ROBOT_PRESETS.find((r) => r.id === 'so101')!;

  await app.page.route(so101.url, (route) => route.fulfill({ status: 200, body: so101Urdf() }));
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Wrap Robot', () => {
  it(
    'wraps the SO-101 in one shell per link that clears every joint’s range',
    async () => {
      await app.page.evaluate(() =>
        (window as unknown as { __studio: Studio }).__studio.poseTool('import_robot', { preset: 'so101' }),
      );
      await dropMesh(`${MESH_NAME}.glb`, roundedCubeGlb());
      await expect.poll(async () => (await parts()).some((p) => p.name === MESH_NAME), { timeout: 30000 }).toBe(true);
      await wrapFromPalette();
      await expect.poll(async () => (await shellIds()).length, { timeout: WRAP_MS }).toBe(SO101_LINKS);

      expect((await parts()).find((p) => p.name === MESH_NAME)?.visible).toBe(false);

      const atRest = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.interference());
      const swept = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.rangeClashes());

      expect(atRest.interferences.filter(touchesShell)).toEqual([]);
      expect(swept.filter((c) => touchesShell(c) && c.b !== 'floor' && c.depthMm > 0.3)).toEqual([]);
    },
    WRAP_MS + 60000,
  );

  it('undoes the whole wrap in one step', async () => {
    const wrappedJoints = await joints();

    await app.page.keyboard.press('Meta+z');
    await expect.poll(async () => (await shellIds()).length).toBe(0);

    expect((await parts()).find((p) => p.name === MESH_NAME)?.visible).toBe(true);
    expect((await joints()).every((j) => !j.child.some((id) => id.startsWith('shell-')))).toBe(true);

    await app.page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await shellIds()).length).toBe(SO101_LINKS);

    expect(await joints()).toEqual(wrappedJoints);
  });

  it('moves a shell with its posed joint', async () => {
    const elbow = (await joints()).find((j) => j.name === 'elbow_flex')!;
    const shell = elbow.child.find((id) => id.startsWith('shell-'))!;
    const link = elbow.child.find((id) => !id.startsWith('shell-'))!;

    await app.page.evaluate(
      (id) => (window as unknown as { __studio: Studio }).__studio.setPose({ [id]: 40 }),
      elbow.id,
    );

    const motion = (id: string) =>
      app.page.evaluate(
        (partId) => (window as unknown as { __studio: Studio }).__studio.posing().deltas.get(partId)?.elements ?? null,
        id,
      );

    await expect.poll(() => motion(shell)).not.toBeNull();
    expect(await motion(shell)).toEqual(await motion(link));
  });
});
