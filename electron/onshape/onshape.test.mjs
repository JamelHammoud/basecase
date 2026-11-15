import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeAccount, fakeArm, fakeOnshapeFetch, KEYS, ONSHAPE_LINK, signedIn } from '../../e2e/fakeOnshape.ts';
import { fakeLegs } from '../../e2e/fakeOnshapeLegs.ts';
import { assemblyRobot } from '../../src/onshape/assemblyRobot.ts';
import { fetchOnshapeUpdate } from '../../src/onshape/onshapeTarget.ts';
import { fixedMateFindings } from '../../src/readiness/buildChecks.ts';
import { withFixedMates } from '../../src/onshape/fixedMates.ts';
import { importRobot } from '../../src/utils/robotImport/importRobot.ts';
import { KEYS_REFUSED, OFF_SITE } from './client.mjs';
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
    const { model, robot, parts } = await sceneOf({ mate: 'BALL' });

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

  it.each([null, ['-90 deg', '45 deg']])(
    'turns a cylindrical axle into a hinge with rotation limits %j',
    async (limits) => {
      const { model, robot, parts } = await sceneOf({ mate: 'CYLINDRICAL', limits });

      expect(model.joints[0].type).toBe('revolute');
      expect(robot.joints[0]).toMatchObject({ name: 'Elbow', type: 'revolute' });
      expect(rounded(robot.joints[0].axis)).toEqual([1, 0, 0]);
      expect(model.joints[0].limit?.map((v) => Math.round((v * 180) / Math.PI)) ?? null).toEqual(
        limits ? [-90, 45] : null,
      );
      expect(model.fixedMates).toEqual([{ name: 'Elbow slide', link: 'Arm' }]);
      expect(fixedMateFindings(parts)[0].text).toContain('Elbow slide');
      expect(parts.flatMap((p) => p.robotLink?.fixedMates ?? [])).not.toContain('Elbow');
    },
  );

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

async function legRobot(arm, seen = []) {
  const account = await signedIn(arm, seen);
  const imported = await account.importAssembly({ link: ONSHAPE_LINK });

  return { ...imported, robot: await assemblyRobot(ONSHAPE_LINK, imported) };
}

describe('subassembly limits', () => {
  it('ranges four knees from one features request and preserves distinct occurrence identities', async () => {
    const seen = [];
    const { robot } = await legRobot(fakeLegs(), seen);
    const knees = robot.joints.filter((j) => j.name === 'Knee');

    expect(knees).toHaveLength(4);
    expect(knees.map((j) => rounded(j.range))).toEqual(Array.from({ length: 4 }, () => [-60, 80]));
    expect(new Set(knees.map((j) => j.onshape?.mate)).size).toBe(4);
    expect(seen.filter((s) => /\/m\/.*\/features/.test(s.url))).toHaveLength(1);
    expect(seen.every((s) => s.url.startsWith('https://cad.onshape.com/api/'))).toBe(true);
    expect(rounded(robot.joints.find((j) => j.onshape?.mate === 'Melbow').range)).toEqual([-10, 10]);
  });

  it('reads limits two subassemblies deep and sends the configuration as query data', async () => {
    const seen = [];
    const { robot } = await legRobot(fakeLegs({ count: 1, nested: true, configuration: 'size=small&x=/foo' }), seen);

    expect(rounded(robot.joints.find((j) => j.name === 'Knee').range)).toEqual([-60, 80]);
    expect(seen.filter((s) => /\/m\/.*\/features/.test(s.url))).toHaveLength(2);
    expect(
      seen
        .filter((s) => /\/m\/.*\/features/.test(s.url))
        .every((s) => new URL(s.url).searchParams.get('configuration') === 'size=small&x=/foo'),
    ).toBe(true);
  });

  it('keeps a subassembly mate with no limits unlimited', async () => {
    const { model } = await legRobot(fakeLegs({ limits: false }));

    expect(model.joints.filter((j) => j.name === 'Knee').map((j) => j.limit)).toEqual([null, null, null, null]);
  });

  it('adds a subassembly mate without reusing the root joint with the same feature id', async () => {
    const arm = fakeLegs({ count: 1 });

    arm.definition.subAssemblies[0].features = [];

    const { robot: before } = await legRobot(arm);
    const { robot: fresh } = await legRobot(fakeLegs({ count: 1 }));
    const plan = await fetchOnshapeUpdate({
      groupId: before.parts[0].group.id,
      current: () => before,
      load: async () => fresh,
    });

    expect(plan.joints).toHaveLength(2);
    expect(new Set(plan.joints.map((j) => j.id)).size).toBe(2);
    expect(plan.joints.find((j) => j.name === 'Hip').id).toBe(before.joints[0].id);
    expect(plan.joints.find((j) => j.name === 'Knee').onshape.mate).toBe('ILeg0/Melbow');
  });

  it.each([false, true])(
    'updates new limits in place with legacy ids %s and gives stable joints on reimport',
    async (legacy) => {
      const { robot: before } = await legRobot(fakeLegs({ limits: false }));
      const { robot: fresh } = await legRobot(fakeLegs());
      const joints = before.joints.map((j) =>
        legacy ? { ...j, onshape: { mate: j.onshape.mate.split('/').at(-1) } } : j,
      );
      const current = { parts: before.parts, joints };
      const plan = await fetchOnshapeUpdate({
        groupId: before.parts[0].group.id,
        current: () => current,
        load: async () => fresh,
      });

      expect(plan.joints.map((j) => j.id)).toEqual(before.joints.map((j) => j.id));
      expect(plan.joints.filter((j) => j.name === 'Knee').map((j) => rounded(j.range))).toEqual(
        Array.from({ length: 4 }, () => [-60, 80]),
      );
      expect(new Set(plan.joints.filter((j) => j.name === 'Knee').map((j) => j.child[0])).size).toBe(4);
      expect(plan.joints).toHaveLength(before.joints.length);
      expect(plan.joints.every((j) => !j.onshape.gone)).toBe(true);

      const again = await legRobot(fakeLegs());

      expect(again.model.joints).toEqual((await legRobot(fakeLegs())).model.joints);
      expect(again.robot.joints.map((j) => j.id)).toEqual(fresh.joints.map((j) => j.id));
    },
  );
});

describe('Onshape account', () => {
  it('seals the keys on disk and only tells the page which are saved', async () => {
    const account = await signedIn(fakeArm());
    const file = fs.readFileSync(path.join(account.keys.file), 'utf8');

    expect(account.account()).toEqual({ access: true, secret: true, name: 'Test Account', error: null });
    expect(file).not.toContain(KEYS.access);
    expect(file).not.toContain(KEYS.secret);
  });

  it('asks for keys before importing', async () => {
    await expect(fakeAccount(fakeArm()).importAssembly({ link: ONSHAPE_LINK })).rejects.toThrow('Settings ▸ Accounts');
  });
});

describe('exploits', () => {
  it.each(['documentId', 'documentMicroversion', 'elementId'])(
    'refuses a crafted subassembly %s before fetching its features or parts',
    async (field) => {
      const arm = fakeLegs();
      const instance = arm.definition.rootAssembly.instances[1];
      const sub = arm.definition.subAssemblies[0];
      const seen = [];

      instance[field] = '../../users/sessioninfo';
      sub[field] = instance[field];

      const account = await signedIn(arm, seen);

      await expect(account.importAssembly({ link: ONSHAPE_LINK })).rejects.toThrow('Onshape sent a malformed');
      expect(seen.filter((s) => /\/m\/|\/translations|massproperties/.test(s.url))).toEqual([]);
    },
  );

  it('refuses a crafted element id on the subassembly definition alone', async () => {
    const arm = fakeLegs();
    const seen = [];

    arm.definition.subAssemblies[0].elementId = '../../users/sessioninfo';

    const account = await signedIn(arm, seen);

    await expect(account.importAssembly({ link: ONSHAPE_LINK })).rejects.toThrow('Onshape sent a malformed assembly.');
    expect(seen.filter((s) => /\/m\/|\/translations|massproperties/.test(s.url))).toEqual([]);
  });
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

  it('remembers that Onshape refused the keys until a pair it accepts is saved', async () => {
    const account = fakeAccount(fakeArm());

    await account.setKey({ kind: 'access', value: KEYS.access });
    await expect(account.setKey({ kind: 'secret', value: `${KEYS.secret}x` })).rejects.toThrow(KEYS_REFUSED);
    expect(account.account()).toEqual({ access: true, secret: true, name: null, error: KEYS_REFUSED });

    await account.setKey({ kind: 'secret', value: KEYS.secret });
    expect(account.account()).toEqual({ access: true, secret: true, name: 'Test Account', error: null });
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
