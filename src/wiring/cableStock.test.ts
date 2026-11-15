import { describe, expect, it } from 'vitest';
import { SUPPLY_BY_ID, type SupplyInfo } from '../data/supplies';
import { selectCableStock } from './cableStock';

describe('selectCableStock', () => {
  it('uses the maker-confirmed 180 mm X3P cable through its exact length', () => {
    expect(selectCableStock('jst-eh-3', 'jst-eh-3', 180)).toEqual({
      cableSupplyId: 'robot-cable-x3p',
      lengthMm: 180,
      status: 'fits',
    });
    expect(SUPPLY_BY_ID['robot-cable-x3p'].cable).toMatchObject({
      connectors: ['jst-eh-3', 'jst-eh-3'],
      lengthMm: 180,
      source: 'https://robotis.us/products/robot-cable-x3p-180mm-10pcs',
    });
  });

  it('keeps the compatible stock and reports a 300 mm run as too long for it', () => {
    expect(selectCableStock('jst-eh-3', 'jst-eh-3', 300)).toEqual({
      cableSupplyId: 'robot-cable-x3p',
      lengthMm: 180,
      status: 'too-short',
    });
  });

  it('leaves the generic Feetech cable length unknown', () => {
    expect(selectCableStock('5264-3', '5264-3', 50, [SUPPLY_BY_ID['servo-cable-5264-3pin']])).toEqual({
      cableSupplyId: 'servo-cable-5264-3pin',
      lengthMm: null,
      status: 'unknown-length',
    });
  });

  it('selects available maker stock for 300 mm and 900 mm 5264 cables', () => {
    expect(selectCableStock('5264-3', '5264-3', 200)).toEqual({
      cableSupplyId: 'waveshare-servo-cable-5264-300',
      lengthMm: 300,
      status: 'fits',
    });
    expect(selectCableStock('5264-3', '5264-3', 400)).toEqual({
      cableSupplyId: 'waveshare-servo-cable-5264-900',
      lengthMm: 900,
      status: 'fits',
    });
  });

  it('checks both ends instead of selecting from the destination alone', () => {
    expect(selectCableStock('5264-3', 'jst-eh-3', 50)).toEqual({
      cableSupplyId: null,
      lengthMm: null,
      status: 'unsupported',
    });
    expect(selectCableStock('wire', 'wire', 50).status).toBe('unsupported');
  });

  it('selects the shortest fitting length independent of catalog order', () => {
    const stock = [240, 100, 180].map((lengthMm): SupplyInfo => ({
      ...SUPPLY_BY_ID['robot-cable-x3p'],
      id: `fixture-${lengthMm}`,
      cable: { connectors: ['jst-eh-3', 'jst-eh-3'], lengthMm, source: 'https://example.com/cable' },
    }));

    expect(selectCableStock('jst-eh-3', 'jst-eh-3', 80, stock).lengthMm).toBe(100);
    expect(selectCableStock('jst-eh-3', 'jst-eh-3', 150, stock).lengthMm).toBe(180);
    expect(selectCableStock('jst-eh-3', 'jst-eh-3', 200, stock).lengthMm).toBe(240);
    expect(selectCableStock('jst-eh-3', 'jst-eh-3', 300, stock)).toMatchObject({ lengthMm: 240, status: 'too-short' });
  });

  it('does not turn an unsourced length into a passing cable', () => {
    const stock: SupplyInfo[] = [
      { ...SUPPLY_BY_ID['robot-cable-x3p'], cable: { connectors: ['jst-eh-3', 'jst-eh-3'], lengthMm: 500 } },
    ];

    expect(selectCableStock('jst-eh-3', 'jst-eh-3', 300, stock).status).toBe('unknown-length');
  });

  it.each([NaN, Infinity, -1])('refuses an unmeasured route length of %s', (length) => {
    expect(() => selectCableStock('jst-eh-3', 'jst-eh-3', length)).toThrow(RangeError);
  });
});
