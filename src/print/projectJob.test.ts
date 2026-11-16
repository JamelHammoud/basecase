import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type PrintMaterial } from '../types/robotics';
import { projectPrinter, roverPlan } from './project.fixtures';
import { projectJobSpec } from './projectJob';

const materials: PrintMaterial[] = ['PLA', 'PETG', 'ABS', 'TPU'];

function fourMaterialPlan() {
  const plan = roverPlan();

  return {
    ...plan,
    plates: materials.map((material, i) => ({ ...plan.plates[1], material, number: i + 1 })),
  };
}

describe('project filament preparation', () => {
  it('preserves matching, ties, missing trays, colors and per-copy assignments', () => {
    const plan = fourMaterialPlan();
    const original = structuredClone(plan);

    for (let seed = 0; seed < 80; seed++) {
      const trays = Array.from({ length: seed % 11 }, (_, i) =>
        Object.freeze({
          slot: [254, -1, 2, 0, 2, 1][(seed + i) % 6],
          type: `${materials[(seed * 3 + i) % materials.length].toLowerCase()} basic`,
          color: ['123456ff', '#abcdefFF', 'bad'][i % 3],
        }),
      );
      const saved = structuredClone(trays);
      const slots = trays.filter((t) => t.slot >= 0 && t.slot < 254).sort((a, b) => a.slot - b.slot);
      const trayOf = (type: PrintMaterial) => slots.find((t) => t.type.toUpperCase().startsWith(type));
      const ordered = [...materials].sort((a, b) => (trayOf(a)?.slot ?? Infinity) - (trayOf(b)?.slot ?? Infinity));
      const spec = projectJobSpec(plan, projectPrinter, DEFAULT_PROJECT, trays);
      const filaments = spec.files[0].project!.filaments;

      expect(filaments.map((f) => f.type)).toEqual(ordered);
      expect(filaments.map((f) => f.color)).toEqual(
        ordered.map((type) => {
          const rgb = trayOf(type)?.color.replace(/^#/, '').slice(0, 6) ?? '';

          return /^[0-9a-f]{6}$/i.test(rgb) ? `#${rgb.toUpperCase()}` : '#EEEEEE';
        }),
      );
      expect(spec.files[0].items.map((item) => item.filament)).toEqual(
        plan.plates.flatMap((p) => p.items.map(() => ordered.indexOf(p.material) + 1)),
      );
      expect(trays).toEqual(saved);
    }

    expect(plan).toEqual(original);
  });

  it('resolves each material once and rebuilds matches after tray edits', () => {
    let reads = 0;
    const trays = materials.map((type, slot) => ({
      slot,
      get type() {
        reads++;

        return type;
      },
      color: '123456FF',
    }));
    const plan = fourMaterialPlan();
    const first = projectJobSpec(plan, projectPrinter, DEFAULT_PROJECT, trays);

    expect(reads).toBe(10);
    trays[0].slot = 3;
    trays[3].slot = 0;

    const second = projectJobSpec(plan, projectPrinter, DEFAULT_PROJECT, trays);

    expect(reads).toBe(20);
    expect(first.files[0].project!.filaments[0].type).toBe('PLA');
    expect(second.files[0].project!.filaments[0].type).toBe('TPU');
  });
});
