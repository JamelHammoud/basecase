import { afterAll, expect, it } from 'vitest';
import { specToPart } from '../../agent/agentScene';
import type { RenderedCad } from '../platform/types';
import { TOLERANCE_MECHANISMS, toleranceFixture } from './tolerances.fixtures';
import { manufacturedSource } from './manufacturedMechanisms.fixtures';
import { analyzeTolerances } from './tolerances';
import { prepareParameterEdit } from './transaction';
import { regenerateParameterGeometry } from './geometry';
import { editParameterDesign } from './edits';
import { parameterVerificationTargets, rememberParameterDesign } from './verification';
import { tolerancePayload } from './tolerancePayload';
import { analysisHandlers } from '../../three/analysis/analysisOps';

interface Kernel {
  renderPart: (language: string, code: string) => Promise<RenderedCad>;
  stopKernels: () => void;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const { createNodeKernel } = await load(
  new URL('../../../electron/cad-kernel/nodeHost/client.mjs', import.meta.url).href,
);
const kernel: Kernel = createNodeKernel();

afterAll(() => kernel.stopKernels());

it.each(TOLERANCE_MECHANISMS.map(([name], index) => ({ name, index })))(
  '$name retains explicit manufacturing identities through native CAD edits',
  async ({ index }) => {
    const fixture = toleranceFixture(index);
    const parts = await Promise.all(
      fixture.parts.map(async (part, position) => {
        const code = manufacturedSource(index, position === 1);
        const rendered = await kernel.renderPart('openscad', code);

        expect(rendered.ok, rendered.error).toBe(true);

        return {
          ...specToPart({
            id: part.id,
            name: part.name,
            shape: 'cad_part',
            cad: { language: 'openscad', code, positions: rendered.positions!, indices: rendered.indices! },
          }),
          rotation: part.rotation,
          dimensionBindings: part.dimensionBindings.map((binding) => ({
            ...binding,
            kind: 'cad' as const,
            target: 'feature',
          })),
        };
      }),
    );
    const requirements = fixture.requirements.map((requirement) => ({
      ...requirement,
      dimensions: requirement.dimensions.map((dimension) => ({
        ...dimension,
        kind: 'cad' as const,
        target: 'feature',
      })),
    }));
    const design = { ...fixture, parts, requirements };
    const payload = tolerancePayload(design);
    const result = analysisHandlers.tolerances(payload).result[0];
    const [, a, b, lowerA, upperA, lowerB, upperB] = TOLERANCE_MECHANISMS[index];

    expect(result.minimum).toBeCloseTo(a + lowerA - (b + upperB), 10);
    expect(result.maximum).toBeCloseTo(a + upperA - (b + lowerB), 10);
    expect(JSON.stringify(payload)).not.toContain('positions":[0');
    rememberParameterDesign(parts, design.parameters);

    const parameter = { ...design.parameters[0], tolerance: { lower: -0.001, upper: 0.001 } };
    const edited = editParameterDesign(design, { op: 'set', parameter });
    let compiled = 0;
    let regenerated = 0;
    const prepared = await prepareParameterEdit(edited, {
      force: parameterVerificationTargets(design, edited, [{ op: 'set', parameter }]),
      compile: (_part, code) => {
        compiled++;

        return kernel.renderPart('openscad', code);
      },
      regenerate: async (job) => {
        regenerated++;

        return regenerateParameterGeometry(job);
      },
      isCurrent: () => true,
    });

    expect(compiled).toBe(0);
    expect(regenerated).toBe(0);
    expect(prepared.parts[0].cad).toBe(parts[0].cad);
    expect(analyzeTolerances(prepared)[0].minimum).toBeCloseTo(a - 0.001 - (b + upperB), 10);
  },
);
