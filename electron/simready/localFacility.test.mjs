import { prepareFacility } from '../../src/fleet/sites/facility';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { findUv } from '../uv.mjs';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { checkedPackage, convertLocalFacility as productionConvert } from './localFacility.mjs';

let environment;
const convertLocalFacility = (files, root) => productionConvert(files, { envDir: environment, root });

const stage = (units, up) => `#usda 1.0
(
    defaultPrim = "Facility"
    ${units === null ? '' : `metersPerUnit = ${units}`}
    upAxis = "${up}"
)
def Xform "Facility" {
    double3 xformOp:translate = (0, 0, 300)
    uniform token[] xformOpOrder = ["xformOp:translate"]
    def Mesh "Floor" {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (100, 0, 0), (0, 0, 100)]
    }
}
`;
const file = (name, text) => ({ name, base64: Buffer.from(text).toString('base64') });

beforeAll(async () => {
  environment = await mkdtemp(path.join(os.tmpdir(), 'basecase-fleet-usd-test-'));
  await promisify(execFile)(findUv(), ['sync', '--project', fileURLToPath(new URL('.', import.meta.url)), '--frozen'], {
    env: { ...process.env, UV_PROJECT_ENVIRONMENT: environment },
  });

  const python =
    process.platform === 'win32'
      ? path.join(environment, 'Scripts', 'python.exe')
      : path.join(environment, 'bin', 'python');

  await promisify(execFile)(
    python,
    ['-c', 'import sys; sys.path.insert(0, sys.argv[1]); import convert', fileURLToPath(new URL('.', import.meta.url))],
    { env: { ...process.env, OPENBLAS_NUM_THREADS: '1' } },
  );
});

afterAll(async () => rm(environment, { recursive: true, force: true }));

it('converts centimeter USD through the production local package path', async () => {
  const usd = await convertLocalFacility([file('facility.usda', stage(null, 'Y'))]);

  expect(usd.sourceFrame).toEqual({ metersPerUnit: 0.01, up: 'Y', authoredUnits: false });

  const geometry = await prepareFacility([{ name: 'facility.glb', bytes: Buffer.from(usd.base64, 'base64') }], {
    units: 'm',
    up: 'Z',
  });

  expect(geometry.positions.slice(0, 3)).toEqual([0, -3, 0]);
});

it('converts a Z-up USDZ facility through the production package path', async () => {
  const archive = zipSync({ 'facility.usda': new TextEncoder().encode(stage(0.01, 'Z')) }, { level: 0 });
  const usdz = await convertLocalFacility([file('facility.usdz', archive)]);

  expect(usdz.sourceFrame).toEqual({ metersPerUnit: 0.01, up: 'Z', authoredUnits: true });

  const geometry = await prepareFacility([{ name: 'facility.glb', bytes: Buffer.from(usdz.base64, 'base64') }], {
    units: 'm',
    up: 'Z',
  });

  expect(geometry.positions.slice(0, 3)).toEqual([0, 0, 3]);
});

it('refuses traversal and oversize packages', () => {
  expect(() => checkedPackage([file('../outside.usda', '')])).toThrow();
  expect(() => checkedPackage([file('a.usda', ''), file('A.usda', '')])).toThrow();
  expect(() => checkedPackage([file('a.usda.', '')])).toThrow();
  expect(() => checkedPackage([file('COM1.usda', '')])).toThrow();
  expect(() => checkedPackage([file('large.usda', Buffer.alloc(32 * 1024 * 1024 + 1))])).toThrow();
});

it.each(['../../outside.usda', '/etc/passwd', 'https://example.test/scene.usda', 'omniverse://server/scene.usda'])(
  'refuses external layer %s before composition',
  async (target) => {
    await expect(
      convertLocalFacility([file('root.usda', `#usda 1.0\n(\n subLayers = [@${target}@]\n)\n`)]),
    ).rejects.toThrow(/USD dependenc/);
  },
);

it('refuses external textures before composition', async () => {
  const texture = `${stage(1, 'Z')}\ndef Shader "Unsafe" {\n asset inputs:file = @/etc/passwd@\n}\n`;

  await expect(convertLocalFacility([file('root.usda', texture)])).rejects.toThrow(/USD dependenc/);
});

it('resolves included local layers without fetching resources', async () => {
  const result = await convertLocalFacility(
    [
      file('root.usda', '#usda 1.0\n(\n subLayers = [@pieces/floor.usda@]\n)\n'),
      file('pieces/floor.usda', stage(0.01, 'Z')),
    ],
    'root.usda',
  );

  expect(result.sourceFrame.metersPerUnit).toBeCloseTo(0.01);
  expect(result.base64).toBeTruthy();
});

it('enforces the local converter memory ceiling on Linux and Windows', async () => {
  const python =
    process.platform === 'win32'
      ? path.join(environment, 'Scripts', 'python.exe')
      : path.join(environment, 'bin', 'python');
  const probe = `import sys, ctypes
sys.path.insert(0, sys.argv[1])
from localLimits import limit_local_memory
limit = limit_local_memory()
if sys.platform.startswith('linux'):
    libc = ctypes.CDLL(None)
    libc.malloc.argtypes = [ctypes.c_size_t]
    libc.malloc.restype = ctypes.c_void_p
    libc.free.argtypes = [ctypes.c_void_p]
    pointer = libc.malloc(4 * 1024 ** 3)
    if pointer:
        libc.free(pointer)
    assert not pointer
elif sys.platform == 'win32':
    kernel = ctypes.WinDLL('kernel32')
    kernel.VirtualAlloc.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_ulong, ctypes.c_ulong]
    kernel.VirtualAlloc.restype = ctypes.c_void_p
    kernel.VirtualFree.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_ulong]
    pointer = kernel.VirtualAlloc(None, 4 * 1024 ** 3, 0x3000, 4)
    if pointer:
        kernel.VirtualFree(pointer, 0, 0x8000)
    assert not pointer
else:
    assert limit is None
`;

  await expect(
    promisify(execFile)(python, ['-c', probe, fileURLToPath(new URL('.', import.meta.url))]),
  ).resolves.toMatchObject({ stderr: '' });
});

it('requires an explicit starting layer for a multi-layer package', async () => {
  await expect(convertLocalFacility([file('a.usda', stage(1, 'Z')), file('b.usda', stage(1, 'Z'))])).rejects.toThrow(
    'Choose a local USD or USDZ facility',
  );
});

it('refuses USDZ paths that alias Windows devices before extraction', async () => {
  const archive = zipSync({ 'NUL.usda': new TextEncoder().encode(stage(1, 'Z')) }, { level: 0 });

  await expect(convertLocalFacility([file('device.usdz', archive)])).rejects.toThrow('portable USDZ file names');
});
