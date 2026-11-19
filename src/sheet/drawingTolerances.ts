import type { ProjectSettings, ScenePart } from '../types/robotics';
import { analyzeTolerances } from '../utils/designParameters/tolerances';
import { validateParameterScene } from '../utils/designParameters/verification';
import type { ManufacturingDeviation } from '../utils/designParameters/types';
import type { DrawingDocument } from './drawingDocument';
import { drawingNumber } from './drawingDocument';
import type { DrawingManifest, DrawingSheet } from './drawingTypes';

export interface AuthoredDrawingDimension {
  parameter: string;
  target: string;
  nominal: number;
  tolerance: ManufacturingDeviation;
}

export function drawingToleranceEvidence(snapshot: { parts: ScenePart[]; project: ProjectSettings } | undefined) {
  const parameters = snapshot?.project.designParameters ?? [];
  const requirements = snapshot?.project.dimensionalRequirements ?? [];

  if (!parameters.some((parameter) => parameter.tolerance !== undefined) && !requirements.length) return undefined;

  validateParameterScene(snapshot!);

  return { parameters, requirements, results: analyzeTolerances({ parts: snapshot!.parts, parameters, requirements }) };
}

export function authoredDrawingDimensions(
  part: ScenePart,
  project: ProjectSettings | undefined,
): AuthoredDrawingDimension[] {
  if (part.kind !== 'box' && part.kind !== 'cube') return [];

  if (part.deformers || part.edges || part.sheet || part.sheetTransform || part.cad || part.mesh || part.sculptMesh)
    return [];

  return (part.dimensionBindings ?? []).flatMap((binding) => {
    const parameter = project?.designParameters?.find((item) => item.name === binding.expression);
    const target = binding.target as keyof ScenePart['dimensions'];

    if (
      binding.kind !== 'primitive' ||
      !parameter?.tolerance ||
      parameter.value === undefined ||
      parameter.value !== part.dimensions[target]
    )
      return [];

    return [
      { parameter: parameter.name, target: binding.target, nominal: parameter.value, tolerance: parameter.tolerance },
    ];
  });
}

export function toleranceDocuments(sheet: DrawingSheet, manifest: DrawingManifest): DrawingDocument[] {
  if (!sheet.authoredDimensions?.length) return [];

  const texts = [
    { at: [12, 14] as [number, number], text: `${sheet.name}    Authored dimensions, mm`, size: 3.5 },
    { at: [12, 20] as [number, number], text: manifest.source.fingerprint, size: 2.5 },
    { at: [12, 26] as [number, number], text: 'Dimension    Parameter    Nominal    Lower / Upper', size: 3 },
    ...sheet.authoredDimensions.map((dimension, index) => ({
      at: [12, 33 + index * 5] as [number, number],
      text: `${dimension.target}    ${dimension.parameter}    ${drawingNumber(dimension.nominal)}    ${signedDeviation(dimension.tolerance.lower)} / ${signedDeviation(dimension.tolerance.upper)}`,
      size: 3,
    })),
  ];

  return [{ lines: [], texts }];
}

const signedDeviation = (value: number) => `${value >= 0 ? '+' : ''}${drawingNumber(value)}`;
