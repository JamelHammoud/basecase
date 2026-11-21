import { expect, it, vi } from 'vitest';
import { generatedFit, fitServices } from './fitVariants.fixtures';
import { fitSourceHash } from './fitVariantIdentity';
import { fitBindings, prepareFitVariants, fitVariantEdit, FIT_VARIANT_LIMITS } from './fitVariants';
import { fitVariantCoupons } from './fitVariantGeometry';
import { editWithOperands } from '../booleans/operands';

it('refuses unsupported and purchased bindings and rejects source budgets before worker dispatch', async () => {
  const design = await generatedFit();
  const cut = vi.fn(fitVariantCoupons);
  const sourceHash = vi.fn(fitSourceHash);
  const services = { ...fitServices, cut, sourceHash };
  const request = {
    binding: fitBindings(design)[0],
    fit: 'mate',
    down: [1, 0, 0] as [number, number, number],
    material: 'PETG' as const,
    values: [22, 22.1],
  };
  const unsupported = {
    ...request,
    binding: { ...request.binding, binding: { ...request.binding.binding, target: 'missing' } },
  };

  await expect(prepareFitVariants(design, unsupported, services)).rejects.toThrow(/authored/);

  const purchased = {
    ...design,
    parts: [design.parts[0], { ...design.parts[1], dimensionBindings: [request.binding.binding] }],
  };

  await expect(prepareFitVariants(purchased, request, services)).rejects.toThrow(/Catalog/);

  const enormous = {
    ...design,
    parts: Array.from({ length: FIT_VARIANT_LIMITS.parts + 1 }, (_, i) => ({ ...design.parts[0], id: `host-${i}` })),
  };

  await expect(prepareFitVariants(enormous, request, services)).rejects.toThrow(/Reduce/);
  expect(sourceHash).not.toHaveBeenCalled();
  expect(cut).not.toHaveBeenCalled();
});

it('keeps the explicitly selected repeated interface and refuses late results and edited geometry', async () => {
  const design = await generatedFit();
  const second = { ...design.parts[1], id: 'second-bearing', position: [30, 0, 0] as [number, number, number] };
  const repeated = { ...design, parts: [...design.parts, second] };
  const request = {
    binding: fitBindings(repeated)[0],
    fit: 'second-bearing',
    down: [1, 0, 0] as [number, number, number],
    material: 'PETG' as const,
    values: [22, 22.1],
  };
  const services = { ...fitServices, sourceHash: fitSourceHash, cut: fitVariantCoupons };
  const comparison = await prepareFitVariants(repeated, request, services);

  expect(comparison.candidates.map((c) => c.coupon?.fit)).toEqual(['second-bearing', 'second-bearing']);

  const changed = {
    ...repeated,
    parts: editWithOperands(repeated.parts, (parts) =>
      parts.map((part) => (part.id === 'base' ? { ...part, dimensions: { ...part.dimensions, width: 90 } } : part)),
    ),
  };

  expect(() => fitVariantEdit(comparison, 0, changed)).toThrow(/changed/);

  let current = true;
  const cut = vi.fn(async (input: Parameters<typeof fitVariantCoupons>[0]) => {
    current = false;

    return fitVariantCoupons(input);
  });

  await expect(prepareFitVariants(repeated, request, { ...services, cut, isCurrent: () => current })).rejects.toThrow(
    /changed/,
  );
  expect(cut).toHaveBeenCalledTimes(1);
});
