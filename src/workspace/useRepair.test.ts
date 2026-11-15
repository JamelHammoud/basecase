import { afterEach, describe, expect, it, vi } from 'vitest';
import { bracket, objectsOf } from '../assembly/assembly.fixtures';
import { fastenerInput } from '../assembly/fastenerSpec';
import { planRemoval } from '../assembly/removalOrder';
import { provenOrder } from '../assembly/provenOrder';
import { buildGuidePlan } from '../guide/guidePlan';
import { approximateScene } from '../guide/guideScene';
import { assemblyIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { GuidePlan } from '../guide/guideTypes';
import { useRepair } from './useRepair';
import * as repairClient from '../guide/repairClient';

afterEach(() => vi.restoreAllMocks());

type Options = Parameters<typeof useRepair>[0];

async function setup() {
  const parts = bracket({ cover: true });
  const geometry = await assemblyIn(snapshotShapes(objectsOf(parts)), {
    ...fastenerInput(parts),
    serviceable: ['plate'],
    budgetMs: 20000,
  });
  const removal = planRemoval(geometry, {});
  const scene = approximateScene('Arm', parts, []);
  const plan = buildGuidePlan({ ...scene, order: provenOrder(removal, Object.keys(geometry.moves)) }, 'PETG');
  const markForReprint = vi.fn();
  const options = {
    partsRef: { current: parts },
    projectRef: { current: { joints: [] } },
    viewportRef: { current: { meshesReady: async () => [], assembly: async () => geometry } },
    guide: { repairPlan: vi.fn(async () => plan) },
    buildAlong: { openPlan: vi.fn(async (source: () => Promise<GuidePlan | null>) => source()) },
    printing: { markForReprint },
  } as unknown as Options;

  return { options, markForReprint, geometry };
}

describe('opening a repair', () => {
  it('opens the measured plan and marks only its printed target for replacement', async () => {
    const { options, markForReprint, geometry } = await setup();
    const result = await useRepair(options).open('plate');

    expect(result.plan?.repair).toEqual({ partId: 'plate', printed: true });
    expect(result.text).toContain('Repair plate');
    expect(markForReprint).toHaveBeenCalledExactlyOnceWith('plate');
    expect(options.buildAlong.openPlan).toHaveBeenCalledOnce();
    expect(options.guide.repairPlan).toHaveBeenCalledExactlyOnceWith(geometry);
  });

  it('explains an unproven teardown without changing the tracker', async () => {
    const { options, markForReprint, geometry } = await setup();

    geometry.timedOut = true;

    expect(await useRepair(options).open('plate')).toEqual({
      text: 'Couldn’t find a teardown for plate. Run Checks in Build.',
    });
    expect(markForReprint).not.toHaveBeenCalled();
  });

  it('discards a plan if the scene changes while its guide is being read', async () => {
    const { options, markForReprint } = await setup();
    const repairPlan = options.guide.repairPlan;

    options.guide.repairPlan = async (geometry) => {
      options.partsRef.current = [...options.partsRef.current];

      return repairPlan(geometry);
    };

    expect((await useRepair(options).open('plate')).plan).toBeUndefined();
    expect(markForReprint).not.toHaveBeenCalled();
  });

  it('does not mark a cancelled opening for replacement', async () => {
    const { options, markForReprint } = await setup();

    options.buildAlong.openPlan = async (source) => {
      await source();

      return null;
    };

    expect((await useRepair(options).open('plate')).plan).toBeUndefined();
    expect(markForReprint).not.toHaveBeenCalled();
  });

  it('discards a repair if its geometry changes while the worker plans it', async () => {
    const { options, markForReprint } = await setup();
    const planInWorker = repairClient.repairInWorker;

    vi.spyOn(repairClient, 'repairInWorker').mockImplementationOnce(async (input) => {
      const result = await planInWorker(input);

      options.partsRef.current = [...options.partsRef.current];

      return result;
    });

    expect((await useRepair(options).open('plate')).plan).toBeUndefined();
    expect(markForReprint).not.toHaveBeenCalled();
  });
});
