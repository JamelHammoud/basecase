import { expect, it, vi } from 'vitest';
import { specToPart } from '../agent/agentScene';
import { readinessFingerprint } from '../readiness/readiness';
import { buildItems, firstUseOrder, itemKeyOf } from './guideItems';

it('shares immutable shape identities between guide preparation and Checks while detecting edited parts', () => {
  const parts = Array.from({ length: 60 }, (_, i) =>
    specToPart({
      id: `part-${i}`,
      shape: 'cad_part',
      cad: {
        language: 'openscad',
        code: 'cube(10);',
        positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10],
        indices: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
      },
    }),
  );
  const samples = parts.map((part) => vi.spyOn(part.cad!.positions, 'slice'));
  const order = firstUseOrder([], parts);
  const items = buildItems(parts, order);
  const fingerprint = readinessFingerprint(parts, {});

  expect(items).toHaveLength(1);
  expect(items[0].partIds).toHaveLength(60);
  expect(firstUseOrder([], [...parts].reverse())).toEqual(order);
  expect(readinessFingerprint([...parts], {})).toBe(fingerprint);

  for (const sampled of samples) expect(sampled).toHaveBeenCalledOnce();

  const edited = { ...parts[0], color: '#123456' };
  const updated = [edited, ...parts.slice(1)];

  expect(itemKeyOf(edited)).not.toBe(itemKeyOf(parts[0]));
  expect(readinessFingerprint(updated, {})).not.toBe(fingerprint);
  expect(buildItems(updated, firstUseOrder([], updated))).toHaveLength(2);

  for (const sampled of samples.slice(1)) expect(sampled).toHaveBeenCalledOnce();

  vi.restoreAllMocks();
});
