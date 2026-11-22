import { expect, it, vi } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { DEFAULT_PROJECT } from '../types/robotics';
import { approximateScene } from './guideScene';
import { buildGuidePlan } from './guidePlan';
import { guideStepParts, preparedStepParts } from './guideSteps';
import { generateGuideSteps } from './generateGuide';

const partsOf = () =>
  Array.from({ length: 24 }, (_, index) =>
    specToPart({ id: `block-${index}`, shape: 'box', position: [index * 40, 10, index % 3] }),
  );
const expectedSteps = (parts: ReturnType<typeof partsOf>) =>
  buildGuidePlan(approximateScene('', parts, []), DEFAULT_PROJECT.material).steps.map((step) => step.partIds);

it('shares pending and completed preparation with synchronous callers without exposing mutable cached output', async () => {
  const parts = partsOf();
  const expected = expectedSteps(parts);
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prepare = vi.fn(async () => {
    await ready;

    return expected;
  });
  const first = preparedStepParts(parts, DEFAULT_PROJECT, prepare);
  const unrelated = { ...DEFAULT_PROJECT, budgetUsd: 200 };
  const second = preparedStepParts(parts, unrelated, prepare);

  expect(prepare).toHaveBeenCalledOnce();
  release();

  const value = await first;

  value[0].push('caller mutation');
  expect(await second).toEqual(expected);
  expect(guideStepParts(parts, DEFAULT_PROJECT)).toEqual(expected);
  expect(await preparedStepParts(parts, DEFAULT_PROJECT, prepare)).toEqual(expected);
  expect(prepare).toHaveBeenCalledOnce();
});

it('keeps newer project and part identities independent of a late preparation', async () => {
  const parts = partsOf();
  let release = (_steps: string[][]) => {};
  const pending = new Promise<string[][]>((resolve) => {
    release = resolve;
  });
  const old = preparedStepParts(parts, DEFAULT_PROJECT, () => pending);
  const project = { ...DEFAULT_PROJECT, joints: [] };
  const latest = [['current']];

  expect(await preparedStepParts(parts, project, async () => latest)).toEqual(latest);
  release([['superseded']]);
  await old;
  expect(guideStepParts(parts, project)).toEqual(latest);

  const edited = parts.map((part, index) =>
    index ? part : { ...part, position: [100, 10, 0] as [number, number, number] },
  );
  const prepare = vi.fn(async () => expectedSteps(edited));

  expect(await preparedStepParts(edited, project, prepare)).toEqual(expectedSteps(edited));
  expect(prepare).toHaveBeenCalledOnce();
});

it('preserves guide grouping and ordering through packed CAD worker transport', async () => {
  const parts = partsOf().map((part, index) =>
    specToPart({
      id: part.id,
      shape: 'cad_part',
      position: part.position,
      cad: {
        language: 'openscad',
        code: 'cube(10);',
        positions: [0.05 + index / 20, 0, 0, 10.05, 0, 0, 0, 10.05, 0],
        indices: [0, 1, 2],
      },
    }),
  );

  expect(await generateGuideSteps(parts, DEFAULT_PROJECT)).toEqual(expectedSteps(parts));
});
