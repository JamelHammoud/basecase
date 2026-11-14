import { describe, expect, it, vi } from 'vitest';
import {
  couldntImport,
  importAccept,
  importKindOf,
  routeImports,
  sortImports,
  type ImportHandlers,
  type ImportKind,
} from './importRoute';

const DESKTOP = { cad: true };
const WEB = { cad: false };

const EXPECTED: Record<ImportKind, string[]> = {
  parts: ['stl', '3mf', 'obj', 'ply', 'fbx', 'glb', 'gltf', 'dae', 'step', 'stp', 'iges', 'igs'],
  svg: ['svg'],
  robot: ['urdf', 'xacro', 'mjcf', 'xml', 'zip'],
  motion: ['bvh'],
  scene: ['basecase'],
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
  data: ['mcap'],
};

const cases = Object.entries(EXPECTED).flatMap(([kind, exts]) => exts.map((ext) => [ext, kind] as const));

describe('import route', () => {
  it.each(cases)('sends .%s to %s', (ext, kind) => {
    expect(importKindOf(`part.${ext}`, DESKTOP)).toBe(kind);
    expect(importKindOf(`Part.${ext.toUpperCase()}`, DESKTOP)).toBe(kind);
  });

  it('leaves CAD out of the web demo', () => {
    for (const ext of ['step', 'STP', 'iges', 'igs']) expect(importKindOf(`a.${ext}`, WEB)).toBeNull();

    expect(importKindOf('a.stl', WEB)).toBe('parts');
    expect(importAccept(WEB)).not.toContain('.step');
    expect(importAccept(DESKTOP)).toContain('.step');
  });

  it('finds no flow for an unknown file or one without an extension', () => {
    expect(importKindOf('notes.txt', DESKTOP)).toBeNull();
    expect(importKindOf('README', DESKTOP)).toBeNull();
    expect(importKindOf('archive.tar.gz', DESKTOP)).toBeNull();
  });

  it('sorts a mixed pick into its flows, keeping unknown files for the error toast', () => {
    const names = ['a.stl', 'b.svg', 'c.urdf', 'd.bvh', 'e.basecase', 'f.png', 'g.step', 'h.txt', 'i.mcap'];
    const sorted = sortImports(
      names.map((name) => ({ name })),
      DESKTOP,
    );

    expect(Object.fromEntries(Object.entries(sorted).map(([k, v]) => [k, v.map((f) => f.name)]))).toEqual({
      parts: ['a.stl', 'g.step'],
      svg: ['b.svg'],
      robot: ['c.urdf'],
      motion: ['d.bvh'],
      scene: ['e.basecase'],
      image: ['f.png'],
      data: ['i.mcap'],
      unknown: ['h.txt'],
    });
  });

  it('sends any image type the drop overlay calls an image to the image flow', () => {
    const files = [
      { name: 'photo.avif', type: 'image/avif' },
      { name: 'scan.bmp', type: 'image/bmp' },
      { name: 'logo.svgz', type: 'image/svg+xml' },
      { name: 'notes.txt', type: 'text/plain' },
    ];
    const sorted = sortImports(files, DESKTOP);

    expect(sorted.image).toEqual([files[0], files[1]]);
    expect(sorted.unknown).toEqual([files[2], files[3]]);
  });

  it('offers every routed extension in the picker', () => {
    const accept = importAccept(DESKTOP).split(',');

    expect(accept.sort()).toEqual(
      Object.values(EXPECTED)
        .flat()
        .map((ext) => `.${ext}`)
        .sort(),
    );
  });

  it('calls each flow once with its files and names unknown files in one toast', () => {
    const handlers = {
      parts: vi.fn(),
      svg: vi.fn(),
      robot: vi.fn(),
      motion: vi.fn(),
      scene: vi.fn(),
      image: vi.fn(),
      data: vi.fn(),
      unknown: vi.fn(),
    } satisfies ImportHandlers<{ name: string }>;
    const files = [
      'a.STL',
      'b.obj',
      'c.svg',
      'd.svg',
      'e.zip',
      'f.urdf',
      'g.bvh',
      'h.png',
      'i.txt',
      'j.doc',
      'k.bvh',
      'l.mcap',
    ].map((name) => ({ name }));

    routeImports(files, handlers, DESKTOP);

    expect(handlers.parts).toHaveBeenCalledExactlyOnceWith([files[0], files[1]]);
    expect(handlers.svg).toHaveBeenCalledExactlyOnceWith(files[2]);
    expect(handlers.robot).toHaveBeenCalledExactlyOnceWith([files[4], files[5]]);
    expect(handlers.motion).toHaveBeenCalledExactlyOnceWith(files[6]);
    expect(handlers.image).toHaveBeenCalledExactlyOnceWith(files[7], 0);
    expect(handlers.data).toHaveBeenCalledExactlyOnceWith([files[11]]);
    expect(handlers.scene).not.toHaveBeenCalled();
    expect(handlers.unknown).toHaveBeenCalledExactlyOnceWith([files[3], files[10], files[8], files[9]]);
    expect(couldntImport([files[8], files[9]])).toBe('Couldn’t import i.txt, j.doc');
  });

  it('is the one route for canvas drop and the Import command', () => {
    const sources = import.meta.glob<string>(['./useCanvasDrop.ts', './useFileImport.ts'], {
      eager: true,
      query: '?raw',
      import: 'default',
    });
    const source = (file: string) => sources[file];

    expect(source('./useCanvasDrop.ts')).toMatch(/\bfiles\.importFiles\(/);
    expect(source('./useFileImport.ts')).toMatch(/\brouteImports\(/);
    expect(source('./useFileImport.ts')).toMatch(/pickImports = async[^;]*importFiles\(/);
  });
});
