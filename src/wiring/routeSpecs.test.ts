import { expect, it } from 'vitest';
import type { Net, Netlist, WiringRouteSpec } from './connectors';
import { component, sceneOf } from './fixtures';
import { wiringNetlist } from './netlist';
import { routeNetlist } from './routeAnalysis';
import { indexRouteSpecs } from './routeSpecs';

const previousSpec = (specs: WiringRouteSpec[], net: Net) =>
  specs.find(
    (spec) =>
      spec.from.partId === net.from.id &&
      spec.from.port === net.from.port?.name &&
      spec.to.partId === net.to.id &&
      spec.to.port === net.to.port?.name,
  );

function fixture(count: number) {
  const scene = sceneOf(
    [component('adapter', 'robotis-u2d2'), { ...component('servo', 'dynamixel-xl330-m288'), position: [70, 0, 0] }],
    [],
  );
  const base = wiringNetlist(scene);
  const net = base.buses[0].nets[0];
  const nets: Net[] = Array.from({ length: count }, (_, i) => ({
    from: { ...net.from, port: { ...net.from.port!, name: `out:${i}|"` } },
    to: { ...net.to, port: { ...net.to.port!, name: `in:${i}|"` } },
  }));
  const specs: WiringRouteSpec[] = nets.map((net, i) => ({
    from: { partId: net.from.id!, port: net.from.port!.name },
    to: { partId: net.to.id!, port: net.to.port!.name },
    supplyId: i % 2 ? 'robot-cable-x3p' : 'missing-stock',
    anchors: i % 3 ? [] : [{ partId: 'adapter', position: [30, 40, 0] }],
  }));
  const netlist: Netlist = {
    ...base,
    buses: [{ ...base.buses[0], nets: nets.slice(0, count / 2) }],
    power: { ...base.power, nets: nets.slice(count / 2) },
  };

  return { scene, nets, specs, netlist };
}

it('preserves first matches, endpoint direction and exact names throughout bus and power routing', () => {
  const { scene, nets, specs, netlist } = fixture(24);
  const reversed = specs.map((spec) => ({ ...spec, from: spec.to, to: spec.from }));
  const choices = [...reversed, ...specs, ...specs.map((spec) => ({ ...spec, anchors: [], supplyId: 'other-stock' }))];
  const before = structuredClone({ scene, netlist, choices });
  const expectedRoute = (net: Net) => {
    const spec = previousSpec(choices, net);
    const single = { ...netlist, buses: [], power: { ...netlist.power, nets: [net] } };

    return routeNetlist({ ...scene, project: { ...scene.project, wiring: spec ? [spec] : [] } }, single, []).power
      .nets[0];
  };
  const expected = nets.map(expectedRoute);
  const routed = routeNetlist({ ...scene, project: { ...scene.project, wiring: choices } }, netlist, []);
  const actual = [...routed.buses[0].nets, ...routed.power.nets];

  expect(actual).toEqual(expected);
  expect(actual.some((net) => net.route?.status === 'pass')).toBe(true);
  expect(actual.some((net) => net.route?.reason === 'Compatible cable missing')).toBe(true);
  expect(actual.some((net) => net.route!.points.length > 4)).toBe(true);
  expect({ scene, netlist, choices }).toEqual(before);

  choices.unshift({ ...specs[0], supplyId: 'robot-cable-x3p', anchors: [] });

  const edited = routeNetlist({ ...scene, project: { ...scene.project, wiring: choices } }, netlist, []);

  expect(edited.buses[0].nets[0]).toEqual(expectedRoute(nets[0]));
  expect(edited.buses[0].nets[0]).not.toEqual(actual[0]);
});

it('keeps ambiguous separator strings distinct and leaves missing endpoints unmatched', () => {
  const { nets, specs } = fixture(1);
  const spec = specs[0];
  const collision = { ...spec, from: { partId: 'adapter|out', port: '0' } };
  const target = { ...spec, from: { partId: 'adapter', port: 'out|0' } };
  const lookup = indexRouteSpecs([collision, target]);
  const net = { ...nets[0], from: { ...nets[0].from, port: { ...nets[0].from.port!, name: 'out|0' } } };

  expect(lookup(net)).toBe(target);
  expect(lookup({ ...net, from: { ...net.from, id: null } })).toBeUndefined();
  expect(lookup({ ...net, to: { ...net.to, port: undefined } })).toBeUndefined();
  expect(indexRouteSpecs()(net)).toBeUndefined();
});
