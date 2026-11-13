import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeAccount, fakeArm, fakeOnshapeFetch, KEYS, ONSHAPE_LINK, signedIn } from '../../e2e/fakeOnshape.ts';
import { fixedMateFindings } from '../../src/readiness/buildChecks.ts';
import { withFixedMates } from '../../src/onshape/fixedMates.ts';
import { importRobot } from '../../src/utils/robotImport/importRobot.ts';
import { OFF_SITE } from './client.mjs';
import { NOT_AN_ASSEMBLY_LINK } from './link.mjs';
import { OnshapeAccount } from './index.mjs';
import { partMesh } from './partMesh.mjs';

const BASIC = Buffer.from(`${KEYS.access}:${KEYS.secret}`).toString('base64');

async function sceneOf(options) {
  const account = await signedIn(fakeArm(options));
  const { model, files } = await account.importAssembly({ link: ONSHAPE_LINK });
  const robot = await importRobot({ kind: 'converted', url: ONSHAPE_LINK, model, files }, { name: model.name });

  return { model, files, robot, parts: withFixedMates(robot.parts, model.fixedMates) };
}

const rounded = (values) => values.map((v) => Math.round(v * 1e4) / 1e4 + 0);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mates to joints', () => {
  it('turns a revolute mate with limits into one hinge on the right axis and range', async () => {
    const { robot } = await sceneOf();

    expect(robot.parts.map((p) => p.name).sort()).toEqual(['Arm', 'Base']);
    expect(robot.joints).toHaveLength(1);

    const [hinge] = robot.joints;

    expect(hinge).toMatchObject({ name: 'Elbow', type: 'revolute' });
    expect(rounded(hinge.axis)).toEqual([1, 0, 0]);
    expect(rounded(hinge.range)).toEqual([-90, 45]);
    expect(hinge.child).toEqual([robot.parts.find((p) => p.name === 'Arm').id]);
    expect(hinge.parent).toEqual([robot.parts.find((p) => p.name === 'Base').id]);
  });

  it('measures the range from where the assembly sits now', async () => {
    const { robot } = await sceneOf({ angleDeg: 30 });

    expect(rounded(robot.joints[0].range)).toEqual([-120, 15]);
  });

  it('turns a slider mate into a slide joint in millimetres', async () => {
    const { robot } = await sceneOf({ mate: 'SLIDER', limits: ['0 mm', '5 cm'] });

    expect(robot.joints[0].type).toBe('prismatic');
    expect(rounded(robot.joints[0].axis)).toEqual([1, 0, 0]);
    expect(rounded(robot.joints[0].range)).toEqual([0, 50]);
  });

  it('fuses parts held by a fastened mate into one link', async () => {
    const { model, robot } = await sceneOf({ gripper: true });

    expect(model.links.map((l) => l.name).sort()).toEqual(['Arm', 'Base']);
    expect(model.links.find((l) => l.name === 'Arm').visuals).toHaveLength(2);
    expect(robot.parts).toHaveLength(2);
    expect(robot.joints).toHaveLength(1);
  });

  it('keeps a mate it can’t map as a fixed joint and one Checks row naming it', async () => {
    const { model, robot, parts } = await sceneOf({ mate: 'CYLINDRICAL' });

    expect(robot.joints).toEqual([]);
    expect(model.joints.map((j) => j.type)).toEqual(['fixed']);

    const rows = fixedMateFindings(parts);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ level: 'note', ids: [parts.find((p) => p.name === 'Arm').id] });
    expect(rows[0].text).toContain('Elbow');
  });

  it('leaves out a revolute mate that closes a loop, without a Checks row', async () => {
    const { model, robot, parts } = await sceneOf({ brace: true });

    expect(robot.joints.map((j) => j.name)).toEqual(['Elbow']);
    expect(model.fixedMates).toEqual([]);
    expect(fixedMateFindings(parts)).toEqual([]);
  });

  it('weighs parts that have a material and leaves the rest unweighed', async () => {
    const { robot } = await sceneOf();

    expect(robot.parts.find((p) => p.name === 'Base').massG).toBe(500);
    expect(robot.parts.find((p) => p.name === 'Arm').massG).toBeUndefined();
  });

  it('sends no mesh for a part whose bodies simplify away', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array(300).map((_, i) => i % 3);
    const data = new Uint8Array(positions.byteLength + indices.byteLength);
    const body = { name: 'Body', color: '#808080', center: [0, 0, 0], size: [1, 1, 0], vertices: 3, triangles: 100 };

    data.set(new Uint8Array(positions.buffer));
    data.set(new Uint8Array(indices.buffer), positions.byteLength);
    vi.spyOn(MeshoptSimplifier, 'simplify').mockReturnValue([new Uint32Array(0), 0]);

    expect(partMesh({ bodies: [body], data }, 12)).toBeNull();
  });
});

describe('Onshape account', () => {
  it('seals the keys on disk and only tells the page which are saved', async () => {
    const account = await signedIn(fakeArm());
    const file = fs.readFileSync(path.join(account.keys.file), 'utf8');

    expect(account.account()).toEqual({ access: true, secret: true, name: 'Test Account' });
    expect(file).not.toContain(KEYS.access);
    expect(file).not.toContain(KEYS.secret);
  });

  it('asks for keys before importing', async () => {
    await expect(fakeAccount(fakeArm()).importAssembly({ link: ONSHAPE_LINK })).rejects.toThrow('Settings ▸ Accounts');
  });
});

describe('exploits', () => {
  it.each([
    'https://cad.onshape.com.evil.example/documents/d0c0000000000000000000d1/w/ee0000000000000000000001/e/a55e00000000000000000e01',
    'https://evil.example/documents/d0c0000000000000000000d1/w/ee0000000000000000000001/e/a55e00000000000000000e01',
    'https://cad.onshape.com@evil.example/documents/d0c0000000000000000000d1/w/ee0000000000000000000001/e/a55e00000000000000000e01',
    'http://cad.onshape.com/documents/d0c0000000000000000000d1/w/ee0000000000000000000001/e/a55e00000000000000000e01',
    'https://cad.onshape.com/documents/..%2F..%2Fapi/w/ee0000000000000000000001/e/a55e00000000000000000e01',
    'https://cad.onshape.com/documents/d0c0000000000000000000d1/w/ee0000000000000000000001/e/a55e0000000000000000e01/../x',
    'https://cad.onshape.com/documents/d0c0000000000000000000d1/m/ee0000000000000000000001/e/a55e00000000000000000e01',
  ])('refuses %s before any request', async (link) => {
    const seen = [];
    const account = await signedIn(fakeArm(), seen);
    const before = seen.length;

    await expect(account.importAssembly({ link })).rejects.toThrow(NOT_AN_ASSEMBLY_LINK);
    expect(seen).toHaveLength(before);
  });

  it('won’t follow Onshape off cad.onshape.com, so the keys never leave it', async () => {
    const seen = [];
    const honest = fakeOnshapeFetch(fakeArm(), seen);
    const account = await signedIn(fakeArm(), seen);

    account.fetchImpl = async (url, init) =>
      url.includes('/assemblies/')
        ? new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } })
        : honest(url, init);

    await expect(account.importAssembly({ link: ONSHAPE_LINK })).rejects.toThrow(OFF_SITE);
    expect(seen.every((s) => s.url.startsWith('https://cad.onshape.com/api/'))).toBe(true);
  });

  it('keeps the keys out of errors, logs and what reaches the scene', async () => {
    const logs = ['log', 'info', 'warn', 'error', 'debug'].map((level) => vi.spyOn(console, level));
    const account = new OnshapeAccount({
      libraryDir: fakeAccount(fakeArm()).keys.file.replace(/[/\\]agent-config[/\\].*$/, ''),
      secrets: null,
      converter: null,
      fetchImpl: fakeOnshapeFetch(fakeArm()),
    });

    await account.setKey({ kind: 'access', value: KEYS.access });

    const refused = await account.setKey({ kind: 'secret', value: `${KEYS.secret}x` }).catch((e) => e);

    expect(refused).toBeInstanceOf(Error);

    const { model, files, parts } = await sceneOf();
    const reached = [String(refused.message), JSON.stringify({ model, parts }), ...logs.flatMap((l) => l.mock.calls)]
      .map(String)
      .join('\n');

    for (const secret of [KEYS.access, KEYS.secret, BASIC]) expect(reached).not.toContain(secret);

    expect(Object.keys(files).every((f) => /^parts\/\d+\.glb$/.test(f))).toBe(true);
  });
});
