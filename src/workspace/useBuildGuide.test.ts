import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bracket, objectsOf } from '../assembly/assembly.fixtures';
import { fastenerInput } from '../assembly/fastenerSpec';
import * as generation from '../guide/generateGuide';
import { assemblyIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { useBuildGuide, type BuildGuide } from './useBuildGuide';
import { useRepair } from './useRepair';

afterEach(() => vi.restoreAllMocks());

type Options = Parameters<typeof useBuildGuide>[0];

async function setup() {
  const parts = bracket({ cover: true });
  const geometry = await assemblyIn(snapshotShapes(objectsOf(parts)), {
    ...fastenerInput(parts),
    serviceable: ['plate'],
    budgetMs: 20000,
  });
  const viewport = { meshesReady: async () => [], assembly: vi.fn(async () => geometry) };
  const updateProjectNow = vi.fn();
  const options = {
    sceneName: 'Repair arm',
    parts,
    partsRef: { current: parts },
    project: DEFAULT_PROJECT,
    projectRef: { current: DEFAULT_PROJECT },
    viewportRef: { current: viewport },
    updateProjectNow,
    showToast: vi.fn(),
  } as unknown as Options;
  let guide: BuildGuide | undefined;

  function Harness() {
    guide = useBuildGuide(options);

    return null;
  }

  renderToString(createElement(Harness));

  return { options, guide: guide!, geometry, viewport, updateProjectNow };
}

describe('repair guide planning', () => {
  it('opens a cold repair using one assembly measurement without drawing or saving a PDF', async () => {
    const { options, guide, viewport, updateProjectNow } = await setup();
    const generate = vi.spyOn(generation, 'generateGuidePlan');
    const save = vi.spyOn(platformBridge, 'saveGuide');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const markForReprint = vi.fn();

    vi.spyOn(platformBridge, 'listSourced').mockResolvedValue([]);

    const source = {
      partsRef: options.partsRef,
      projectRef: options.projectRef,
      viewportRef: options.viewportRef,
      guide,
      buildAlong: { openPlan: async (make: () => Promise<unknown>) => make() },
      printing: { markForReprint },
    } as unknown as Parameters<typeof useRepair>[0];
    const before = JSON.stringify(options.partsRef.current);
    const result = await useRepair(source).open('plate');

    expect(result.plan?.repair).toEqual({ partId: 'plate', printed: true });
    expect(result.plan?.steps.map((step) => step.repairPhase)).toEqual(
      expect.arrayContaining(['remove', 'swap', 'reassemble']),
    );
    expect(viewport.assembly).toHaveBeenCalledExactlyOnceWith({ serviceable: ['plate'], budgetMs: 20000 });
    expect(generate).toHaveBeenCalledOnce();
    expect(markForReprint).toHaveBeenCalledExactlyOnceWith('plate');
    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(updateProjectNow).not.toHaveBeenCalled();
    expect(JSON.stringify(options.partsRef.current)).toBe(before);
  });

  it('reuses the plan for unchanged parts and measures changed parts again', async () => {
    const { options, guide, geometry } = await setup();
    const generate = vi.spyOn(generation, 'generateGuidePlan');
    const first = await guide.repairPlan(geometry);

    expect(await guide.repairPlan(geometry)).toBe(first);
    expect(generate).toHaveBeenCalledOnce();

    const generatePdf = vi.spyOn(generation, 'generateGuide').mockResolvedValue(null);

    expect(await guide.currentPlan()).toBeNull();
    expect(generatePdf).toHaveBeenCalledOnce();

    options.partsRef.current = options.partsRef.current.map((part) => ({ ...part, name: `${part.name} revised` }));

    const revised = await guide.repairPlan(geometry);

    expect(revised).not.toEqual(first);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('discards a plan when the scene changes while its measurements run', async () => {
    const { options, guide, geometry } = await setup();
    const original = generation.generateGuidePlan;

    vi.spyOn(generation, 'generateGuidePlan').mockImplementationOnce(async (input) => {
      const plan = await original(input);

      options.partsRef.current = options.partsRef.current.map((part) => ({ ...part, name: `${part.name} revised` }));

      return plan;
    });

    expect(await guide.repairPlan(geometry)).toBeNull();
  });
});
