import { surfaceOperands } from '../booleans/operands';
import type { ParameterDesign } from '../utils/designParameters/mutations';
import { planParameterEdit } from '../utils/designParameters/plan';
import { prepareParameterEdit, type ParameterServices } from '../utils/designParameters/transaction';
import { editParameterDesign, type ParameterEdit } from '../utils/designParameters/edits';
import type { PrintMaterial } from '../types/robotics';
import type { DimensionBinding } from '../utils/designParameters/types';
import { errorMessage } from '../utils/errorMessage';
import { isPrinted } from '../utils/bom';
import type { FitCoupon } from '../three/analysis/fitCoupons';
import type { Vec3 } from '../three/printability';
import type { FitVariantCut } from './fitVariantGeometry';

export const FIT_VARIANT_LIMITS = { count: 8, parts: 128, bindings: 32, triangles: 100_000, totalTriangles: 400_000 };

export interface FitBinding {
  id: string;
  label: string;
  host: string;
  part: string;
  binding: DimensionBinding;
  parameter: string;
}

export interface FitVariantRequest {
  binding: FitBinding;
  fit: string;
  material: PrintMaterial;
  values: number[];
  down: Vec3;
}

export interface FitCandidate {
  id: string;
  value: number;
  coupon?: FitCoupon;
  reason?: string;
}

export interface FitComparison {
  source: ParameterDesign;
  sourceSha256: string;
  request: FitVariantRequest;
  candidates: FitCandidate[];
}

export interface FitVariantServices extends ParameterServices {
  sourceHash: (design: ParameterDesign) => Promise<string>;
  cut: (input: FitVariantCut) => Promise<FitCoupon[]>;
}

export function fitBindings(design: ParameterDesign): FitBinding[] {
  const declarations = new Map(design.parameters.map((p) => [p.name, p]));

  return design.parts
    .filter((p) => isPrinted(p) && !p.print?.skip)
    .flatMap((host) =>
      surfaceOperands([host]).flatMap((part) =>
        (part.dimensionBindings ?? []).flatMap((binding) => {
          const parameter = binding.expression.trim();
          const declaration = declarations.get(parameter);

          if (
            part.componentId ||
            part.hardware ||
            part.supplyId ||
            binding.unit !== 'mm' ||
            !declaration ||
            declaration.unit !== 'mm' ||
            declaration.expression !== undefined
          )
            return [];

          return [
            {
              id: JSON.stringify([host.id, part.id, binding.kind, binding.target]),
              label: `${host.name}: ${part.name} ${binding.target} (${parameter})`,
              host: host.id,
              part: part.id,
              binding,
              parameter,
            },
          ];
        }),
      ),
    );
}

function assertSize(design: ParameterDesign, count: number) {
  const flat = surfaceOperands(design.parts);
  const triangleCount = flat.reduce(
    (sum, p) =>
      sum +
      (p.mesh?.indices?.length ??
        p.cad?.indices?.length ??
        (p.sculptMesh ? p.sculptMesh.positions.length / 3 : 30_000)) /
        3,
    0,
  );

  if (
    flat.length > FIT_VARIANT_LIMITS.parts ||
    triangleCount * count > FIT_VARIANT_LIMITS.totalTriangles ||
    triangleCount > FIT_VARIANT_LIMITS.triangles ||
    flat.reduce((n, p) => n + (p.dimensionBindings?.length ?? 0), 0) > FIT_VARIANT_LIMITS.bindings
  )
    throw new Error('Reduce the design geometry before preparing fit variants.');
}

function assertRequest(design: ParameterDesign, request: FitVariantRequest) {
  const { values, binding, fit, down } = request;

  if (
    values.length < 2 ||
    values.length > FIT_VARIANT_LIMITS.count ||
    values.some((v) => !Number.isFinite(v) || v <= 0 || v > 1000) ||
    new Set(values).size !== values.length
  )
    throw new Error('Enter 2 to 8 distinct values greater than 0 and up to 1000 mm.');

  assertSize(design, values.length);

  const authored = fitBindings(design).find((b) => b.id === binding?.id);
  const host = design.parts.find((p) => p.id === binding?.host);

  if (
    !authored ||
    JSON.stringify(authored) !== JSON.stringify(binding) ||
    !host ||
    !design.parts.some((p) => p.id === fit && p.role === 'solid') ||
    surfaceOperands([host]).some((p) => p.id === fit)
  )
    throw new Error('Choose an authored millimeter binding and a separate mating part.');

  if (down.length !== 3 || down.some((v) => !Number.isFinite(v)) || Math.abs(Math.hypot(...down) - 1) > 0.001)
    throw new Error('Choose a supported print orientation.');

  planParameterEdit(design.parts, design.parameters);
}

const valueEdit = (request: FitVariantRequest, value: number): ParameterEdit => ({
  op: 'set',
  parameter: { name: request.binding.parameter, unit: 'mm', value },
});

function assertLive(services: FitVariantServices) {
  if (services.signal?.aborted) throw new Error('Dimension edit cancelled.');

  if (!services.isCurrent()) throw new Error('The design changed during dimension preparation.');
}

export async function prepareFitVariants(
  design: ParameterDesign,
  request: FitVariantRequest,
  services: FitVariantServices,
): Promise<FitComparison> {
  assertRequest(design, request);

  assertLive(services);

  const sourceSha256 = await services.sourceHash(design);
  const candidates: FitCandidate[] = [];
  let triangles = 0;

  for (const [index, value] of request.values.entries()) {
    assertLive(services);

    const candidate: FitCandidate = { id: `fit-variant-${index + 1}`, value };

    try {
      const changed = editParameterDesign(design, valueEdit(request, value));
      const result = await prepareParameterEdit(changed, { ...services, verify: true });

      assertSize(result, request.values.length);

      const coupons = await services.cut({ parts: result.parts, request });
      const coupon = coupons[0];

      if (!coupon || coupon.positions.length < 9) throw new Error('The interface produced no coupon.');

      triangles += coupon.positions.length / 9;

      if (triangles > FIT_VARIANT_LIMITS.totalTriangles) throw new Error('Fit variants exceed the geometry limit.');

      candidate.coupon = coupon;
    } catch (error) {
      candidate.reason = errorMessage(error);
    }

    assertLive(services);

    candidates.push(candidate);
  }

  return { source: design, sourceSha256, request, candidates };
}

export function fitVariantEdit(comparison: FitComparison, index: number, current: ParameterDesign): ParameterEdit {
  const { source, request } = comparison;
  const candidate = comparison.candidates[index];

  if (
    source.parts.length !== current.parts.length ||
    source.parts.some((p, i) => p !== current.parts[i]) ||
    JSON.stringify(source.parameters) !== JSON.stringify(current.parameters)
  )
    throw new Error('The design changed. Prepare the fit variants again.');

  assertRequest(current, request);

  if (!candidate?.coupon || candidate.reason) throw new Error('Choose a prepared coupon.');

  const tolerance = current.parameters.find((parameter) => parameter.name === request.binding.parameter)?.tolerance;

  return {
    op: 'set',
    parameter: {
      name: request.binding.parameter,
      unit: 'mm',
      value: candidate.value,
      ...(tolerance ? { tolerance } : {}),
      fitChoice: {
        kind: 'design-choice',
        value: candidate.value,
        sourceSha256: comparison.sourceSha256,
        sourcePart: request.binding.part,
        binding: request.binding.binding,
        interface: { id: request.fit, key: candidate.coupon.key },
        down: request.down,
        material: request.material,
      },
    },
  };
}
