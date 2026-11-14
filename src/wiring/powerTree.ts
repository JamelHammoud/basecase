import { COMPONENT_BY_ID } from '../data/components';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { ScenePart } from '../types/robotics';
import { servoParts, servoRegulator, servoSource } from '../utils/engineeringPower';
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

interface Source {
  end: NetEnd;
  battery: boolean;
  name: string;
}

function packSource(pack: ScenePart): Source {
  const c = COMPONENT_BY_ID[pack.componentId!];

  return { end: endOf(pack, portOf(pack, 'power-out')!), battery: !!c.battery, name: c.name };
}

function suppliedSource(id: string | null, supplyId: string): Source | null {
  const s = SUPPLY_BY_ID[supplyId];

  return s?.battery && s.connector
    ? { end: { id, name: s.name, connector: s.connector }, battery: true, name: s.name }
    : null;
}

const isChosen = (source: Source, chosen: string) => chosen === source.name || chosen.endsWith(` in ${source.name}`);

function batterySource(scene: WiringScene): Source | null {
  const { parts, project } = scene;
  const candidates = [
    ...parts.filter((p) => isPack(p) && portOf(p, 'power-out')).map(packSource),
    ...parts.flatMap((p) => (p.supplyId ? [suppliedSource(p.id, p.supplyId)] : [])),
    ...(project.extras ?? []).flatMap((x) =>
      x.key.startsWith('supply:') ? [suppliedSource(null, x.key.slice(7))] : [],
    ),
  ].filter((s): s is Source => s !== null);
  const chosen = servoSource({ ...scene, servos: servoParts(parts) })?.name;

  return candidates.find((s) => chosen !== undefined && isChosen(s, chosen)) ?? candidates[0] ?? null;
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
  const pack = batterySource(scene);
  const source = pack?.end ?? (sceneTether(scene) ? TETHER : null);

  if (!source) return { source: null, battery: false, nets: [] };

  const regulators = regulatorParts(scene.parts);
  const feed = busFeed(scene, regulators);
  const adapters = scene.parts.filter((p) => isBusAdapter(p) && portOf(p, 'power-in'));
  const nets: Net[] = [
    { from: source, to: FUSE },
    { from: FUSE, to: SWITCH },
    ...regulators.map((r) => ({ from: SWITCH, to: endOf(r, portOf(r, 'power-in')!) })),
    ...adapters.map((a) => ({ from: feed, to: endOf(a, portOf(a, 'power-in')!) })),
  ];

  return { source, battery: !!pack?.battery, nets };
}
