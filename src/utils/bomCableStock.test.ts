import { describe, expect, it } from 'vitest';
import { so101, xl330Arm } from '../wiring/fixtures';
import { wiringNetlist } from '../wiring/netlist';
import { buildBom } from './bom';

const cableKey = 'supply:robot-cable-x3p';
const build = (onHand = 0, extraQty = 0) => {
  const scene = xl330Arm();
  const project = { ...scene.project, extras: [{ key: cableKey, qty: extraQty }] };

  return buildBom({ ...scene, project, purchases: { [cableKey]: { onHand } }, measures: {} });
};

describe('cable stock in the BOM', () => {
  it('keeps confirmed lengths, extras, owned pieces and pack prices separate', () => {
    const scene = so101();
    const wiring = wiringNetlist(scene);
    const short = 'supply:waveshare-servo-cable-5264-300';
    const long = 'supply:waveshare-servo-cable-5264-900';
    const project = { ...scene.project, extras: [{ key: short, qty: 7 }] };

    wiring.buses[0].nets.forEach((net, index) => {
      net.route = {
        points: [],
        requiredMm: index < 3 ? 200 : 400,
        cableSupplyId: index < 3 ? short.slice(7) : long.slice(7),
        lengthMm: index < 3 ? 300 : 900,
        status: 'pass',
        reason: null,
        limitingPose: {},
      };
    });

    const purchases = { [short]: { onHand: 2 }, [long]: { onHand: 1 } };
    const bom = buildBom({ ...scene, project, purchases, measures: {}, wiring });

    expect(bom.lines.find((line) => line.key === short)).toMatchObject({
      qty: 7,
      owned: 2,
      toBuy: 5,
      packs: 1,
      estUsd: 1.99,
    });
    expect(bom.lines.find((line) => line.key === long)).toMatchObject({
      qty: 3,
      owned: 1,
      toBuy: 2,
      packs: 1,
      estUsd: 3.99,
    });
  });

  it('uses the supplied measured netlist instead of rebuilding its bus counts', () => {
    const scene = xl330Arm();
    const wiring = wiringNetlist(scene);

    wiring.buses[0].nets = wiring.buses[0].nets.slice(0, 1);

    const bom = buildBom({ ...scene, purchases: {}, measures: {}, wiring });

    expect(bom.lines.find((line) => line.key === cableKey)?.qty).toBe(1);
  });

  it('counts five cable pieces and buys one ten-piece pack', () => {
    expect(build().lines.find((line) => line.key === cableKey)).toMatchObject({
      qty: 5,
      owned: 0,
      toBuy: 5,
      packs: 1,
      estUsd: 21.85,
    });
  });

  it('uses owned pieces before rounding remaining pieces to purchase packs', () => {
    expect(build(4, 15).lines.find((line) => line.key === cableKey)).toMatchObject({
      qty: 15,
      owned: 4,
      toBuy: 11,
      packs: 2,
      estUsd: 43.7,
    });
    expect(build(5).lines.find((line) => line.key === cableKey)).toMatchObject({
      qty: 5,
      owned: 5,
      toBuy: 0,
      packs: 0,
      lineUsd: 0,
    });
  });
});
