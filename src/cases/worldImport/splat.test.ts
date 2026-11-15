import { describe, expect, it } from 'vitest';
import { readWorldFiles } from '../worldImport';
import { objWorld, splatPly, splatSpz, splatSpz4 } from './fixtures';
import { readPly } from './ply';

describe('world splats and textures', () => {
  it('keeps optional Gaussian PLY, legacy SPZ and v4 SPZ attached to the collider', async () => {
    for (const file of [splatPly(), await splatSpz(), splatSpz4()]) {
      const result = await readWorldFiles([objWorld(), file]);

      const bytes = file.name.endsWith('.ply') ? readPly(file.bytes).bytes : file.bytes;

      expect(result).toMatchObject({ kind: 'mesh', splat: { count: 1, bytes } });
    }
  });

  it('refuses splat count bombs, nonfinite PLY and malformed compressed streams', async () => {
    const broken = splatSpz4();

    broken.bytes[112] = 0;

    for (const file of [splatPly('NaN'), splatPly('0', 1000001), await splatSpz(1000001), broken]) {
      await expect(readWorldFiles([objWorld(), file])).rejects.toThrow();
    }
  });

  it('keeps supported SPZ harmonic degrees and refuses degree four before Spark initialization', async () => {
    for (const degree of [0, 1, 2, 3]) {
      for (const file of [await splatSpz(1, degree), splatSpz4(degree)]) {
        await expect(readWorldFiles([objWorld(), file])).resolves.toMatchObject({ splat: { count: 1 } });
      }
    }

    for (const file of [await splatSpz(1, 4), splatSpz4(4)]) {
      await expect(readWorldFiles([objWorld(), file])).rejects.toThrow('spherical harmonic degree 0–3');
    }
  });

  it('refuses extra, missing and nonfinite ASCII PLY tokens against its declared count', async () => {
    const file = splatPly();
    const text = new TextDecoder().decode(file.bytes);
    const payloads = [
      text + ' 0',
      text.replace('0 0 0 1 0 0 0 1 0 0 0', '0 0 0'),
      text + ' Infinity',
      text + ' 0'.repeat(4096),
    ];

    for (const payload of payloads) {
      await expect(
        readWorldFiles([objWorld(), { name: file.name, bytes: new TextEncoder().encode(payload) }]),
      ).rejects.toThrow(/properties/);
    }
  });

  it('preserves dropped OBJ textures and refuses texture pixel bombs', async () => {
    const obj = objWorld();
    const text = new TextDecoder().decode(obj.bytes).replace('f 1', 'mtllib paint.mtl\nusemtl Paint\nf 1');
    const material = {
      name: 'paint.mtl',
      bytes: new TextEncoder().encode('newmtl Paint\nKd 0.2 0.4 0.6\nmap_Kd paint.png'),
    };
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),
      (v) => v.charCodeAt(0),
    );
    const files = [
      { name: obj.name, bytes: new TextEncoder().encode(text) },
      material,
      { name: 'paint.png', bytes: png },
    ];
    const result = await readWorldFiles(files);

    expect(result.kind === 'mesh' && result.mesh.materials[1].image).toMatchObject({
      mimeType: 'image/png',
      flipY: true,
      bytes: png,
    });
    new DataView(png.buffer).setUint32(16, 100000);
    await expect(readWorldFiles(files)).rejects.toThrow(/pixels/);
  });
});
