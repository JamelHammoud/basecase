import { describe, expect, it } from 'vitest';
import { SUPPLY_BY_ID, type CableStock, type SupplyInfo } from '../data/supplies';
import type { ConnectorType } from '../types/ports';
import { seededRandom } from '../utils/seededRandom';
import { selectCableStock, type CableSelection } from './cableStock';

const connectors: [ConnectorType, ConnectorType][] = [
  ['jst-eh-3', 'jst-eh-3'],
  ['5264-3', 'jst-eh-3'],
  ['jst-eh-3', '5264-3'],
  ['wire', 'wire'],
];
const cable = (id: string, metadata?: CableStock): SupplyInfo => ({
  ...SUPPLY_BY_ID['robot-cable-x3p'],
  id,
  cable: metadata,
});
const confirmed = (id: string, lengthMm: number) =>
  cable(id, { connectors: connectors[0], lengthMm, source: 'https://example.com/cable' });

function sortedSelection(stock: readonly SupplyInfo[], ends: ConnectorType[], required: number): CableSelection {
  const compatible = stock.filter((supply) => {
    const pair = supply.cable?.connectors;

    return pair && [...pair].sort().join('|') === [...ends].sort().join('|');
  });
  const known = compatible
    .filter((supply) => supply.cable!.source && Number.isFinite(supply.cable!.lengthMm) && supply.cable!.lengthMm! > 0)
    .sort((a, b) => a.cable!.lengthMm! - b.cable!.lengthMm!);
  const fit = known.find((supply) => supply.cable!.lengthMm! >= required);
  const chosen = fit ?? known.at(-1) ?? compatible[0];

  if (!chosen) return { cableSupplyId: null, lengthMm: null, status: 'unsupported' };

  if (!known.length) return { cableSupplyId: chosen.id, lengthMm: null, status: 'unknown-length' };

  return { cableSupplyId: chosen.id, lengthMm: chosen.cable!.lengthMm!, status: fit ? 'fits' : 'too-short' };
}

describe('cable stock selection contracts', () => {
  it('keeps the first shortest fit and the last longest fallback on equal lengths', () => {
    const stock = [
      confirmed('long-first', 300),
      confirmed('short-first', 100),
      confirmed('long-last', 300),
      confirmed('short-last', 100),
    ];

    expect(selectCableStock(...connectors[0], 100, stock).cableSupplyId).toBe('short-first');
    expect(selectCableStock(...connectors[0], 101, stock).cableSupplyId).toBe('long-first');
    expect(selectCableStock(...connectors[0], 301, stock)).toEqual({
      cableSupplyId: 'long-last',
      lengthMm: 300,
      status: 'too-short',
    });
  });

  it('reads edited lengths and sources afresh without changing the stock', () => {
    const stock = [confirmed('short', 100), confirmed('long', 300)];
    const before = structuredClone(stock);

    expect(selectCableStock(...connectors[0], 150, stock).cableSupplyId).toBe('long');
    expect(stock).toEqual(before);

    stock[0].cable!.lengthMm = 200;

    expect(selectCableStock(...connectors[0], 150, stock).cableSupplyId).toBe('short');

    stock[0].cable!.source = undefined;

    expect(selectCableStock(...connectors[0], 150, stock).cableSupplyId).toBe('long');

    stock[0].cable = before[0].cable;

    expect(selectCableStock(...connectors[0], 150, stock).cableSupplyId).toBe('long');
    expect(stock).toEqual(before);
  });

  it('matches sorted selection across mixed stock, reversed ends, unknown lengths and empty input', () => {
    const random = seededRandom('a11f7ed0a11f7ed0a11f7ed0a11f7ed0');
    const lengths = [undefined, NaN, Infinity, -Infinity, -1, 0, 50, 100, 300, 900];

    for (let size = 0; size < 80; size++) {
      const stock = Object.freeze(
        Array.from({ length: size }, (_, index) =>
          Object.freeze(
            cable(
              `item-${index}`,
              index % 11 === 0
                ? undefined
                : Object.freeze({
                    connectors: connectors[Math.floor(random() * connectors.length)],
                    lengthMm: lengths[Math.floor(random() * lengths.length)],
                    source: random() > 0.25 ? 'https://example.com/cable' : undefined,
                  }),
            ),
          ),
        ),
      );
      const before = structuredClone(stock);

      for (const ends of connectors)
        for (const required of [0, 50, 100, 300, 1000])
          expect(selectCableStock(...ends, required, stock)).toEqual(sortedSelection(stock, ends, required));

      expect(stock).toEqual(before);
    }
  });

  it.each([
    { count: 300, required: 0 },
    { count: 600, required: 0 },
    { count: 300, required: 301 },
    { count: 600, required: 601 },
  ])('validates each of $count compatible cables once for a $required mm route', ({ count, required }) => {
    let reads = 0;
    const stock = Array.from({ length: count }, (_, index) =>
      cable(`item-${index}`, {
        connectors: connectors[0],
        lengthMm: count - index,
        get source() {
          reads++;

          return 'https://example.com/cable';
        },
      }),
    );

    expect(selectCableStock(...connectors[0], required, stock)).toEqual({
      cableSupplyId: required === 0 ? `item-${count - 1}` : 'item-0',
      lengthMm: required === 0 ? 1 : count,
      status: required === 0 ? 'fits' : 'too-short',
    });
    expect(reads).toBe(count);
  });
});
