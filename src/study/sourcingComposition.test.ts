import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { bracketAndServo, BRACKET_CODE, tunedAnswer } from '../agent/fixtures/tunedBracket';
import { servoArm } from '../sim/fixtures/servoArm';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { checkedRender } from '../utils/platform/renderedCad';
import { buildBom } from '../utils/bom';
import { sourcingScene, sourcingEvidence, SOURCING_REQUIREMENTS, SOURCING_TIME } from './sourcingFixtures';
import { sourcingSnapshot, studyPurchasing } from './sourcing';
import { studyScene } from './scene';
import { compileStudyDimension } from './dimensions';
import { refreshStudyGeometry } from './geometry';
import type { StudyKnob } from './types';

afterEach(() => vi.restoreAllMocks());

it('grades the BOM after supported battery and named-dimension preparation with separate currency totals', async () => {
  const arm = servoArm();
  const bracket = bracketAndServo()[0];
  const batteries = ['ovonic-2s-2200-50c', 'ovonic-4s-2200-35c'].map((componentId, index) => ({
    ...box(`pack-${index}`, [100 + index * 100, 30, 0], [30, 20, 60], 100),
    kind: 'component' as const,
    componentId,
  }));
  const seeded = sourcingScene([...arm.parts, bracket, ...batteries], { ...DEFAULT_PROJECT, joints: arm.joints });
  const purchases = await sourcingEvidence(seeded);
  const scene = sourcingScene([...arm.parts, bracket, batteries[0]], seeded.project);
  const buffer = readFileSync(new URL('../../public/parts/ovonic-4s-2200-35c.glb', import.meta.url));

  scene.meshFiles = {
    'ovonic-4s-2200-35c': buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  };

  const before = structuredClone(scene);
  const knobs: StudyKnob[] = [
    { id: 'battery', kind: 'battery', parts: [batteries[0].id], values: ['component:ovonic-4s-2200-35c'] },
    { id: 'wall', kind: 'dimension', part: bracket.id, name: 'wall', values: [3] },
  ];
  const euro = purchases['component:ovonic-4s-2200-35c'].supplierOffers!.offers[0].offer;

  euro.currency = 'EUR';

  const snapshot = sourcingSnapshot({ ...SOURCING_REQUIREMENTS, quantity: 20 }, purchases, SOURCING_TIME);
  const render = vi.spyOn(platformBridge, 'renderCad').mockResolvedValue(checkedRender(tunedAnswer(3).result));
  const candidate = await studyScene({ ...scene, sourcing: snapshot }, knobs, [0, 0], {
    dimension: compileStudyDimension,
    geometry: refreshStudyGeometry,
  });
  const compared = studyPurchasing(buildBom({ ...candidate, purchases, now: new Date(SOURCING_TIME) }), snapshot);

  expect(render).toHaveBeenCalledWith('openscad', BRACKET_CODE.replace('wall = 2;', 'wall = 3;'), bracket.cad?.expect);
  expect(candidate.sourcing).toBe(snapshot);
  expect(candidate.parts.find((part) => part.id === bracket.id)?.cad?.code).toContain('wall = 3;');
  expect(compared.lines.find((item) => item.line.key === 'component:ovonic-4s-2200-35c')).toMatchObject({
    line: { qty: 20 },
    issues: [],
  });
  expect(compared.lines.some((item) => item.line.key === 'component:ovonic-2s-2200-50c')).toBe(false);
  expect(Object.keys(compared.totals).sort()).toEqual(['EUR', 'USD']);
  expect(scene).toEqual(before);
});
