import { rememberParameterDesign, parameterVerificationTargets } from './verification';
import { editParameterDesign } from './edits';
import { prepareParameterEdit } from './transaction';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { toleranceFixture } from './tolerances.fixtures';
import { analyzeTolerances } from './tolerances';
import { tolerancePayload } from './tolerancePayload';
import { analysisHandlers } from '../../three/analysis/analysisOps';
import { toleranceRows } from '../../readiness/tolerances';
import { currentReadiness, ignoreFinding, readinessOf } from '../../readiness/readiness';
import { engineeringFindings } from '../../readiness/findings';
import { runEngineering } from '../engineering';
import { projectFingerprint } from '../../workspace/runReadiness';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { resolvePrinter } from '../../data/printers';
import type { ParameterDesign } from './mutations';

function repeatedModules(count: number): ParameterDesign {
  const modules = Array.from({ length: count }, (_, index) => {
    const design = toleranceFixture();
    const named = (name: string) => `${name}_${index}`;

    return {
      parameters: design.parameters.map((parameter) => ({ ...parameter, name: named(parameter.name) })),
      parts: design.parts.map((part) => ({
        ...part,
        id: named(part.id),
        dimensionBindings: part.dimensionBindings.map((binding) => ({
          ...binding,
          expression: named(binding.expression),
        })),
      })),
      requirements: design.requirements.map((requirement) => ({
        ...requirement,
        name: named(requirement.name),
        expression: `${named('outer')} - ${named('inner')}`,
        dimensions: requirement.dimensions.map((dimension) => ({
          ...dimension,
          part: named(dimension.part),
          parameter: named(dimension.parameter),
        })),
      })),
    };
  });

  return {
    parameters: modules.flatMap((module) => module.parameters),
    parts: modules.flatMap((module) => module.parts),
    requirements: modules.flatMap((module) => module.requirements),
  };
}

it('keeps repeated independent spacer variations separate and refuses missing data', () => {
  const design = repeatedModules(2);

  design.requirements = [
    {
      ...design.requirements![0],
      expression: 'outer_0 - inner_0 - inner_1',
      dimensions: [...design.requirements![0].dimensions, design.requirements![1].dimensions[1]],
    },
  ];

  expect(analyzeTolerances(design)[0].minimum).toBeCloseTo(30.2 - 30.25 - 30.25, 10);
  delete design.parameters[3].tolerance;
  expect(analyzeTolerances(design)[0].status).toBe('unresolved');
});

it('keeps Checks authoritative and invalidates old results on tolerance and requirement edits', () => {
  const design = toleranceFixture();
  const project = {
    ...DEFAULT_PROJECT,
    designParameters: design.parameters,
    dimensionalRequirements: design.requirements,
  };
  const printer = resolvePrinter(undefined, []);
  const world = { purchases: {}, money: { code: 'USD', ratesDate: '2026-11-18' } };
  const fingerprint = projectFingerprint(design.parts, project, printer, world);
  const rows = toleranceRows(analysisHandlers.tolerances(tolerancePayload(design)).result);
  const engineering = runEngineering({ parts: [], project: DEFAULT_PROJECT, measures: {}, servoOutputs: {} });
  const findings = engineeringFindings({ ...engineering, rows });
  const readiness = readinessOf(findings, { parts: design.parts, rows, fingerprint });

  expect(readiness.blockers.some((finding) => finding.fix?.kind === 'parameters')).toBe(true);
  expect(toleranceRows([])).toEqual([]);

  const requirements = [...design.requirements, { ...design.requirements[0], name: 'second_clearance' }];
  const sharedRows = toleranceRows(analyzeTolerances({ ...design, requirements }));
  const sharedFindings = engineeringFindings({ ...engineering, rows: sharedRows });
  const ignored = readinessOf(sharedFindings, {
    parts: design.parts,
    fingerprint,
    rows: sharedRows,
    decisions: ignoreFinding(undefined, sharedFindings[0]),
  });

  expect(new Set(sharedFindings.map((finding) => finding.key)).size).toBe(2);
  expect(ignored.ignored).toHaveLength(1);
  expect(ignored.blockers.filter((finding) => finding.fix?.kind === 'parameters')).toHaveLength(1);

  const changed = {
    ...project,
    designParameters: design.parameters.map((parameter) => ({ ...parameter, tolerance: { lower: 0, upper: 0 } })),
  };
  const nextFingerprint = projectFingerprint(design.parts, changed, printer, world);

  expect(nextFingerprint).not.toBe(fingerprint);
  expect(currentReadiness(readiness, nextFingerprint)).toBeNull();
  expect(projectFingerprint(design.parts, { ...project, dimensionalRequirements: [] }, printer, world)).not.toBe(
    fingerprint,
  );
});

it('measures bounded analysis payloads without transmitting retained native meshes', async () => {
  const measurements: unknown[] = [];

  for (const count of [1, 64]) {
    const design = repeatedModules(count);
    const payload = tolerancePayload(design);
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    const samples: number[] = [];

    for (let iteration = 0; iteration < 20; iteration++) {
      const started = performance.now();
      const results = analysisHandlers.tolerances(payload).result;

      samples.push(performance.now() - started);
      expect(results).toHaveLength(count);
      expect(results.every((result) => result.status === 'fail')).toBe(true);
    }

    rememberParameterDesign(design.parts, design.parameters);

    const parameter = { ...design.parameters[0], tolerance: { lower: 0, upper: 0 } };
    const edited = editParameterDesign(design, { op: 'set', parameter });
    const prepareStarted = performance.now();
    const prepared = await prepareParameterEdit(edited, {
      force: parameterVerificationTargets(design, edited, [{ op: 'set', parameter }]),
      compile: async () => {
        throw new Error('Tolerance edit compiled geometry.');
      },
      regenerate: async () => {
        throw new Error('Tolerance edit regenerated geometry.');
      },
      isCurrent: () => true,
    });
    const prepareMs = performance.now() - prepareStarted;

    expect(prepared.parts.every((part, index) => part === design.parts[index])).toBe(true);
    samples.sort((a, b) => a - b);
    measurements.push({
      toleranceModules: count,
      payloadBytes: bytes,
      prepareMs,
      regenerated: 0,
      retainedParts: prepared.parts.length,
      medianMs: samples[10],
      p95Ms: samples[19],
    });
  }

  mkdirSync('scratch', { recursive: true });
  writeFileSync('scratch/tolerance-measurements.json', JSON.stringify(measurements, null, 2));
});
