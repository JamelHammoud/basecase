import { describe, expect, it } from 'vitest';
import type { CableRoute } from './connectors';
import { rover, xl330Arm } from './fixtures';
import { wiringNetlist } from './netlist';
import { wiringSupplies } from './wiringSupplies';

const route = (cableSupplyId: string | null): CableRoute => ({
  cableSupplyId,
  requiredMm: 150,
  lengthMm: 180,
  status: 'pass',
  points: [],
  reason: null,
  limitingPose: {},
});

describe('wiringSupplies', () => {
  it('counts a selected power cable in place of its connector pigtails', () => {
    const netlist = wiringNetlist(rover());

    netlist.power.nets[0].route = route('fixture-power-cable');

    const counts = wiringSupplies(netlist);

    expect(counts.get('supply:fixture-power-cable')).toBe(1);
    expect(counts.has('supply:xt60-pigtail')).toBe(false);
  });

  it('groups selected cable lengths by their supply keys', () => {
    const netlist = wiringNetlist(xl330Arm());

    netlist.buses[0].nets.forEach((net, index) => {
      net.route = route(index < 2 ? 'fixture-cable-100' : 'fixture-cable-180');
    });
    expect(Object.fromEntries(wiringSupplies(netlist))).toEqual({
      'supply:fixture-cable-100': 2,
      'supply:fixture-cable-180': 3,
    });
  });

  it('does not replace an unresolved selection with a cable chosen only by connector', () => {
    const netlist = wiringNetlist(xl330Arm());

    netlist.buses[0].nets.forEach((net) => {
      net.route = { ...route(null), status: 'unresolved' };
    });
    expect(wiringSupplies(netlist).size).toBe(0);
  });

  it('does not use the bus fallback across incompatible connector ends', () => {
    const netlist = wiringNetlist(xl330Arm());

    netlist.buses[0].nets[0].from.connector = '5264-3';
    expect(wiringSupplies(netlist).get('supply:robot-cable-x3p')).toBe(4);
  });
});
