import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFigure } from '../../src/three/viewport/figureModels.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const stand = async (kind) => {
  const file = fs.readFileSync(path.join(here, '..', '..', 'public', 'figures', `${kind}.glb`));
  const geometry = await parseFigure(new Uint8Array(file).buffer, kind);

  return geometry.boundingBox;
};

describe('scale figures', () => {
  it('stands the human on the floor at unit height, so its scale is its height', async () => {
    const box = await stand('human');

    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(1, 5);
    expect(box.max.x + box.min.x).toBeCloseTo(0, 5);
  });

  it('stands the dog on the floor at its real size, longer than it is tall', async () => {
    const box = await stand('dog');

    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeGreaterThan(600);
    expect(box.max.y).toBeLessThan(820);
    expect(box.max.z - box.min.z).toBeGreaterThan(box.max.y);
  });
});
