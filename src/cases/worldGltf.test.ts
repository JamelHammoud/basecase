import { describe, expect, it } from 'vitest';
import { MB } from '../../electron/fileSize.mjs';
import { glbOf, gltfOf, objOf, splatPlyOf, type GltfJson } from './worldFixtureFiles';
import { garageMesh, kitchenMesh, splatOn, type FixtureMesh } from './worldFixtures';
import { readGltf } from './worldGltf';
import { checkWorldSizes, worldFilesOf } from './worldImport';
import { readWorldFiles } from './worldFiles';
import { readObj } from './worldObj';
import type { DroppedFile } from './worldTypes';

const file = (name: string, bytes: Uint8Array): DroppedFile => ({ name, bytes });
const text = (name: string, body: string) => file(name, new TextEncoder().encode(body));

const withNaN = (m: FixtureMesh): FixtureMesh => ({ ...m, positions: [NaN, ...m.positions.slice(1)] });

const glbEdited = (edit: (json: GltfJson) => void) => file('garage.glb', glbOf(garageMesh(), { edit }));

const refusal = (files: DroppedFile[]) =>
  readWorldFiles(files).then(
    () => 'read',
    (error: Error) => `${error.constructor.name}: ${error.message}`,
  );

describe('glTF and OBJ reading', () => {
  it('reads a GLB and its glTF twin to the same triangles', () => {
    const glb = readGltf(file('kitchen.glb', glbOf(kitchenMesh())), []);
    const twin = gltfOf(kitchenMesh(), 'kitchen');
    const gltf = readGltf(twin[0], twin);

    expect(gltf.positions).toEqual(glb.positions);
    expect(gltf.indices).toEqual(glb.indices);
    expect(gltf.files).toEqual(['kitchen.bin']);
    expect(glb.indices).toHaveLength(kitchenMesh().indices.length);
  });

  it('reads base64 buffers and lists only dropped images', () => {
    const [gltf, bin] = gltfOf(garageMesh(), 'garage', {
      edit: (json) => {
        json.images = [{ uri: 'wall.png' }, { uri: '../home.png' }, { uri: 'missing.png' }];
      },
    });
    const json = JSON.parse(new TextDecoder().decode(gltf.bytes)) as GltfJson;
    const wall = text('wall.png', 'png');

    json.buffers = [
      {
        byteLength: bin.bytes.byteLength,
        uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...bin.bytes))}`,
      },
    ];

    const read = readGltf(text('garage.gltf', JSON.stringify(json)), [wall]);

    expect(read.indices).toHaveLength(garageMesh().indices.length);
    expect(read.files).toEqual(['wall.png']);
  });

  it('skips line and point primitives', async () => {
    const lines = glbEdited((json) => {
      ((json.meshes as GltfJson[])[0].primitives as GltfJson[])[0].mode = 1;
    });

    expect(await refusal([lines])).toBe('CaseFileError: garage.glb holds no triangles.');
  });

  it('reads OBJ polygons, v/vt/vn corners and negative indices', () => {
    const obj = text(
      'quad.obj',
      'v 0 0 0\nv 1 0 0\nv 1 0 1\r\nv 0 0 1\nvt 0 0\nvn 0 1 0\no quad\nf -4/1/1 -3/1/1 -2//1 -1\n',
    );
    const read = readObj(obj);

    expect([...read.indices]).toEqual([0, 1, 2, 0, 2, 3]);
    expect([...read.positions]).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]);
    expect(() => readObj(text('bad.obj', 'v 0 0 0\nf 1 2 3\n'))).toThrow('bad.obj is damaged.');
  });
});

describe('world file exploits', () => {
  const splat = () => file('room.ply', splatPlyOf(splatOn(garageMesh(), 1)));
  const collider = () => file('garage.glb', glbOf(garageMesh()));

  it('refuses a file or a drop over the caps', () => {
    expect(() => checkWorldSizes([{ name: 'big.glb', byteLength: 301 * MB }])).toThrow('big.glb is over 300 MB.');
    expect(() =>
      checkWorldSizes([
        { name: 'a.glb', byteLength: 250 * MB },
        { name: 'b.ply', byteLength: 250 * MB },
        { name: 'c.bin', byteLength: 250 * MB },
      ]),
    ).toThrow('These files are over 600 MB together.');
    expect(() => checkWorldSizes([{ name: 'ok.glb', byteLength: 300 * MB }])).not.toThrow();
  });

  it('refuses a mesh that claims too many triangles', async () => {
    const huge = glbEdited((json) => {
      (json.accessors as GltfJson[])[2].count = 3_000_000;
    });

    expect(await refusal([huge])).toBe('CaseFileError: garage.glb has over 500,000 triangles.');
  });

  it('refuses a vertex that isn’t a number', async () => {
    const glb = file('garage.glb', glbOf(withNaN(garageMesh())));
    const obj = file('garage.obj', objOf(withNaN(garageMesh())));
    const nanSplat = splatOn(garageMesh(), 1);

    nanSplat.positions[4] = NaN;

    expect(await refusal([glb])).toBe('CaseFileError: garage.glb has a vertex that isn’t a number.');
    expect(await refusal([obj, splat()])).toBe('CaseFileError: garage.obj has a vertex that isn’t a number.');
    expect(await refusal([collider(), file('nan.ply', splatPlyOf(nanSplat))])).toBe(
      'CaseFileError: nan.ply has a point that isn’t a number.',
    );
  });

  it('refuses a vertex too large for a float', async () => {
    const far = text('far.obj', 'v 1e39 0 0\nv 1 0 0\nv 0 0 1\nf 1 2 3\n');

    expect(await refusal([far, splat()])).toBe('CaseFileError: far.obj has a vertex that isn’t a number.');
  });

  it.each([
    '../secret.bin',
    '..%2Fsecret.bin',
    'file:///etc/passwd',
    'https://example.com/x.bin',
    '/etc/passwd',
    'C:\\secret.bin',
    'sub/secret.bin',
  ])('refuses a buffer at %s', async (uri) => {
    const files = gltfOf(garageMesh(), 'garage', {
      edit: (json) => {
        (json.buffers as GltfJson[])[0].uri = uri;
      },
    });
    const secret = file('secret.bin', files[1].bytes);

    expect(await refusal([files[0], secret])).toBe('CaseFileError: garage.gltf reads a file outside the drop.');
  });

  it('refuses a buffer that names a file not dropped', async () => {
    const [gltf] = gltfOf(garageMesh(), 'garage');

    expect(worldFilesOf([gltf])).toEqual([gltf]);
    expect(await refusal([gltf])).toBe('CaseFileError: Drop garage.bin with garage.gltf.');
    expect(await refusal([gltf, splat()])).toBe('CaseFileError: Drop garage.bin with garage.gltf.');
  });

  const vertices = garageMesh().positions.length / 3;

  it.each<[string, Array<string | number>, unknown]>([
    ['an accessor past its view', ['accessors', 0, 'count'], vertices + 1],
    ['an accessor offset past its view', ['accessors', 2, 'byteOffset'], 1 << 30],
    ['a view past its buffer', ['bufferViews', 2, 'byteLength'], 1 << 30],
    ['a stride too short', ['bufferViews', 0, 'byteStride'], 4],
    ['a buffer longer than its data', ['buffers', 0, 'byteLength'], 1 << 30],
    ['an index past its vertices', ['accessors', 2, 'bufferView'], 0],
    ['a missing accessor', ['meshes', 0, 'primitives', 0, 'indices'], 9],
    ['a negative count', ['accessors', 0, 'count'], -3],
    ['a node that is its own child', ['nodes', 0, 'children'], [0]],
  ])('refuses %s', async (_, path, value) => {
    const edit = (json: GltfJson) => {
      const parent = path.slice(0, -1).reduce<Record<string | number, unknown>>((at, key) => at[key] as GltfJson, json);

      parent[path.at(-1)!] = value;
    };

    expect(await refusal([glbEdited(edit), splat()])).toBe('CaseFileError: garage.glb is damaged.');
  });

  it('refuses compressed meshes', async () => {
    const draco = glbEdited((json) => {
      json.extensionsRequired = ['KHR_draco_mesh_compression'];
    });
    const meshopt = glbEdited((json) => {
      (json.bufferViews as GltfJson[])[0].extensions = { EXT_meshopt_compression: {} };
    });
    const message = 'CaseFileError: garage.glb is compressed. Export it without Draco or meshopt.';

    expect(await refusal([draco, splat()])).toBe(message);
    expect(await refusal([meshopt, splat()])).toBe(message);
  });

  it('refuses a truncated GLB and one that isn’t a GLB', async () => {
    const glb = glbOf(garageMesh());

    expect(await refusal([file('garage.glb', glb.subarray(0, glb.length - 40)), splat()])).toBe(
      'CaseFileError: garage.glb is damaged.',
    );
    expect(await refusal([text('garage.glb', 'solid nothing'), splat()])).toBe('CaseFileError: garage.glb is damaged.');
  });
});
