import { describe, expect, it } from 'vitest';
import { agentCatalog } from './agentCatalog';
import { onHandUpdates } from './onHand';

const OWNED = 'component:dynamixel-xl430-w250';
const CHEAPER = 'component:feetech-sts3215';

describe('find_parts with parts on hand', () => {
  const ctx = { purchases: { [OWNED]: { onHand: 4 } }, used: { [OWNED]: 1 } };

  it('ranks an owned servo above a cheaper one the person would have to buy', () => {
    const before = agentCatalog('', { purchases: {} });
    const after = agentCatalog('', ctx);

    expect(before.indexOf(`- ${CHEAPER} `)).toBeLessThan(before.indexOf(`- ${OWNED} `));
    expect(after.indexOf(`- ${OWNED} `)).toBeLessThan(after.indexOf(`- ${CHEAPER} `));
  });

  it('says how many are owned, used in this scene and left', () => {
    const text = agentCatalog('xl430', ctx);

    expect(text).toContain(`On hand (use these first): ${OWNED} 4 owned, 1 in this scene, 3 left.`);
    expect(text).toMatch(new RegExp(`- ${OWNED} .* · 4 owned, 1 in this scene, 3 left`));
  });

  it('shows no on-hand header when nothing is owned', () => {
    expect(agentCatalog('xl430', { purchases: {} })).not.toContain('On hand');
  });
});

describe('record_on_hand', () => {
  it('takes counts for catalog keys and exact hardware', () => {
    expect(
      onHandUpdates([
        { key: 'component:feetech-sts3215|c001', onHand: 6 },
        { key: 'hardware:socket_head|M3|12', onHand: 100 },
        { key: 'supply:servo-cable-5264-3pin', onHand: 0 },
      ]),
    ).toEqual({
      updates: [
        { key: 'component:feetech-sts3215|c001', onHand: 6 },
        { key: 'hardware:socket_head|M3|12|black|hex', onHand: 100 },
        { key: 'supply:servo-cable-5264-3pin', onHand: 0 },
      ],
      refused: [],
    });
  });

  it('refuses unknown keys, versionless components, filament, and negative or non-integer counts', () => {
    const { updates, refused } = onHandUpdates([
      { key: 'component:no-such-servo', onHand: 2 },
      { key: 'hardware:socket_head|M99|5', onHand: 2 },
      { key: '__proto__', onHand: 1 },
      { key: 'component:feetech-sts3215', onHand: 6 },
      { key: 'supply:filament-pla', onHand: 2 },
      { key: 'component:feetech-sts3215|c001', onHand: -1 },
      { key: 'component:feetech-sts3215|c001', onHand: 2.5 },
      { key: 'component:feetech-sts3215|c001', onHand: Number.NaN },
      { key: 'component:feetech-sts3215|c001', onHand: '6' },
    ]);

    expect(updates).toEqual([]);
    expect(refused).toHaveLength(9);
  });

  it('refuses a payload that is not a list', () => {
    expect(onHandUpdates({ key: 'component:feetech-sts3215|c001', onHand: 6 })).toEqual({ updates: [], refused: [] });
  });
});
