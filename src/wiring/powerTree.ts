import { COMPONENT_BY_ID } from '../data/components';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { ScenePart } from '../types/robotics';
import { servoParts, servoRegulator } from '../utils/engineeringPower';
import { sceneTether } from '../utils/powerSources';
import { endOf, isBusAdapter, portOf, type Net, type NetEnd, type PowerTree, type WiringScene } from './connectors';

const inline = (name: string): NetEnd => ({ id: null, name, connector: 'wire' });

const FUSE = inline('Inline Fuse Holder');
const SWITCH = inline('Power Switch');
const TETHER = inline('DC Power Supply');

const isPack = (p: ScenePart) => {
  const c = p.kind === 'component' && p.componentId ? COMPONENT_BY_ID[p.componentId] : undefined;

  return !!(c?.battery || c?.holder);
};

function suppliedBattery(id: string | null, supplyId: string): NetEnd | null {
  const s = SUPPLY_BY_ID[supplyId];

  return s?.battery && s.connector ? { id, name: s.name, connector: s.connector } : null;
}

function batteryEnd({ parts, project }: WiringScene): NetEnd | null {
  const pack = parts.find((p) => isPack(p) && portOf(p, 'power-out'));

  if (pack) return endOf(pack, portOf(pack, 'power-out')!);

  const supplied = [
    ...parts.flatMap((p) => (p.supplyId ? [suppliedBattery(p.id, p.supplyId)] : [])),
    ...(project.extras ?? []).flatMap((x) =>
      x.key.startsWith('supply:') ? [suppliedBattery(null, x.key.slice(7))] : [],
    ),
  ];

  return supplied.find((e) => e !== null) ?? null;
}

const regulatorParts = (parts: ScenePart[]) =>
  parts.filter((p) => p.componentId && COMPONENT_BY_ID[p.componentId]?.regulator && portOf(p, 'power-in'));

function busFeed(scene: WiringScene, regulators: ScenePart[]): NetEnd {
  const rail = servoRegulator({ ...scene, servos: servoParts(scene.parts) });
  const part = regulators.find((r) => r.id === rail?.id);
  const out = part && portOf(part, 'power-out');

  return part && out ? endOf(part, out) : SWITCH;
}

export function powerTree(scene: WiringScene): PowerTree {
  const source = batteryEnd(scene) ?? (sceneTether(scene) ? TETHER : null);

  if (!source) return { source: null, nets: [] };

  const regulators = regulatorParts(scene.parts);
  const feed = busFeed(scene, regulators);
  const adapters = scene.parts.filter((p) => isBusAdapter(p) && portOf(p, 'power-in'));
  const nets: Net[] = [
    { from: source, to: FUSE },
    { from: FUSE, to: SWITCH },
    ...regulators.map((r) => ({ from: SWITCH, to: endOf(r, portOf(r, 'power-in')!) })),
    ...adapters.map((a) => ({ from: feed, to: endOf(a, portOf(a, 'power-in')!) })),
  ];

  return { source, nets };
}
