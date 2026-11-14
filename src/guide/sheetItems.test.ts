import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { sheetPart } from '../sheet/sheet.fixtures';
import { DEFAULT_PROJECT } from '../types/robotics';
import { guideFingerprint } from './guideFingerprint';
import { buildItems, buildTools, firstUseOrder } from './guideItems';

describe('sheet parts in the build guide', () => {
  const sheet = sheetPart({ sheet: { material: 'carbon-fiber', thicknessMm: 3 } });

  it('separates sheets from printed copies and omits the printer for sheets alone', () => {
    const parts = [sheet, { ...sheet, id: 'printed', sheet: undefined }];
    const items = buildItems(parts, firstUseOrder([], parts));
    const sheets = items.filter((item) => item.partIds.includes(sheet.id));

    expect(items).toHaveLength(2);
    expect(sheets[0].kind).toBe('bought');
    expect(sheets[0].name).toBe('Carbon fiber plate');
    expect(sheets[0].detail).toBe('3 mm');
    expect(buildTools(sheets, 'PLA')).toEqual([]);
    expect(buildTools(items, 'PLA').map((tool) => tool.id)).toEqual(['printer']);
  });

  it('refreshes the guide after sheet material or affine thickness changes', () => {
    const key = (part: typeof sheet) => guideFingerprint('Sheet robot', [part], DEFAULT_PROJECT);
    const acrylic = { ...sheet, sheet: { material: 'acrylic' as const, thicknessMm: 3 } };
    const thicker = { ...sheet, sheetTransform: new Matrix4().makeScale(1, 1, 2).toArray() };

    expect(key(acrylic)).not.toBe(key(sheet));
    expect(key(thicker)).not.toBe(key(sheet));
  });
});
