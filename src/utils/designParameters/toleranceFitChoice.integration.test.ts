import { expect, it } from 'vitest';
import { generatedFit, fitServices } from '../../print/fitVariants.fixtures';
import { fitSourceHash } from '../../print/fitVariantIdentity';
import { fitVariantCoupons } from '../../print/fitVariantGeometry';
import { fitBindings, prepareFitVariants, fitVariantEdit } from '../../print/fitVariants';

it('keeps coupon choices separate from explicitly declared manufacturing deviations', async () => {
  for (const tolerance of [undefined, { lower: -0.05, upper: 0.1 }]) {
    const source = await generatedFit();
    const design = { ...source, parameters: source.parameters.map((parameter) => ({ ...parameter, tolerance })) };
    const comparison = await prepareFitVariants(
      design,
      {
        binding: fitBindings(design)[0],
        fit: 'mate',
        material: 'PETG',
        values: [22.2, 22.4],
        down: [1, 0, 0],
      },
      { ...fitServices, sourceHash: fitSourceHash, cut: fitVariantCoupons },
    );
    const edit = fitVariantEdit(comparison, 0, design);

    expect(edit.op).toBe('set');

    if (edit.op !== 'set') throw new Error('Expected a parameter edit.');

    expect(edit.parameter.tolerance).toEqual(tolerance);
    expect(edit.parameter.fitChoice?.kind).toBe('design-choice');
    expect(edit.parameter.value).toBeCloseTo(22.2, 8);
  }
});
