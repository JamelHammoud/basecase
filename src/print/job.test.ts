import { expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { DEFAULT_PROJECT } from '../types/robotics';
import { bedOf } from './bed';
import { jobSpec } from './job';
import { buildPrintPlan } from './plan';
import { planInput } from './plan.fixtures';

it('keeps material files and slice groups aligned after build-order plate interleaving and edits', () => {
  const setup = resolvePrinter('bambu-lab-p1s', []);
  const inputs = [
    planInput('base', [180, 180, 10], { material: 'PETG', firstStep: 1 }),
    planInput('foot', [180, 180, 10], { firstStep: 0, print: { copies: 2 } }),
    planInput('cover', [180, 180, 10], { material: 'PETG', firstStep: 2 }),
    planInput('skipped', [20, 20, 10], { material: 'ABS', print: { skip: true } }),
    planInput('oversized', [300, 300, 10], { material: 'TPU' }),
  ];

  inputs[4].check.fits = false;

  const before = structuredClone(inputs);

  for (const parts of [inputs, [...inputs].reverse(), [], inputs.slice(1)]) {
    const plan = buildPrintPlan(parts, setup, bedOf(setup.model), 'fine');
    const saved = structuredClone(plan);
    const job = jobSpec(plan, setup, DEFAULT_PROJECT);
    const materials = [...new Set(plan.plates.map((plate) => plate.material))];

    expect(job.files.map((file) => file.key)).toEqual(materials);
    expect(job.groups.map((group) => group.material)).toEqual(materials);

    for (const [index, material] of materials.entries()) {
      const plates = plan.plates.filter((plate) => plate.material === material);

      expect(job.files[index]).toEqual({
        key: material,
        plates: plates.map((plate) => ({ number: plate.local, name: `Plate ${plate.number}` })),
        items: plates.flatMap((plate) =>
          plate.items.map((item) => ({
            id: item.id,
            name: item.copy ? `${item.name} (${item.copy + 1})` : item.name,
            matrix: item.matrix,
            plate: plate.local,
          })),
        ),
      });
      expect(job.groups[index]).toEqual({
        material,
        plates: plates.map((plate) => ({ number: plate.number, local: plate.local, hash: plate.hash })),
      });
    }

    expect(plan).toEqual(saved);
    expect(plan.plateOf).not.toHaveProperty('skipped');
    expect(plan.plateOf).not.toHaveProperty('oversized');
  }

  expect(inputs).toEqual(before);
});
