import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { writeThreeMf, type ThreeMfInput } from './threeMf';

const metadata = (key: string, value: number | string) => `<metadata key="${key}" value="${value}"/>`;

function reference(input: ThreeMfInput): string {
  const counts = new Map<number, number>();
  const instances = input.items.map((item) => {
    const index = counts.get(item.objectId) ?? 0;

    counts.set(item.objectId, index + 1);

    return { ...item, index };
  });
  const plates = input.plates.map((plate) => {
    const entries = instances
      .filter((item) => item.plate === plate.number)
      .map(
        (item) =>
          `<model_instance>${metadata('object_id', item.objectId)}${metadata('instance_id', item.index)}${metadata('identify_id', item.objectId)}</model_instance>`,
      );

    return `<plate>${metadata('plater_id', plate.number)}${metadata('plater_name', plate.name)}${metadata('locked', 'false')}${entries.join('')}</plate>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<config>${plates.join('')}</config>\n`;
}

function fixture(variant: number): ThreeMfInput {
  const numbers = [7, 2, 11, -0, Infinity, Number.NaN, 7, 99];

  return {
    objects: [],
    items: Array.from({ length: variant * 7 }, (_, i) => ({
      objectId: (i * 3 + variant) % 9,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i, 0, 0, 1],
      plate: [...numbers, 500][(i * 5 + variant) % 9],
    })),
    plates: numbers.map((number) => ({ number, name: `Plate ${number}` })),
    layout: 'flat',
    plateSize: [256, 256],
    project: { filaments: [], settings: {} },
  };
}

function configOf(input: ThreeMfInput): string {
  const files = unzipSync(writeThreeMf(input));

  return strFromU8(files['Metadata/model_settings.config']);
}

describe('project plate membership', () => {
  it('preserves complete metadata for interleaved copies, missing plates, empty plates and duplicate numbers', () => {
    for (let variant = 0; variant < 24; variant++) {
      const input = fixture(variant);
      const before = structuredClone(input);

      expect(configOf(input)).toBe(reference(input));
      expect(input).toEqual(before);
      input.items.reverse();
      input.plates.reverse();
      expect(configOf(input)).toBe(reference(input));
      input.plates = [];
      expect(configOf(input)).toBe(reference(input));
    }
  });
});
