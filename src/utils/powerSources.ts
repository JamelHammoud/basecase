import { BatterySpec, COMPONENT_BY_ID, ComponentInfo, RegulatorSpec } from '../data/components';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { ScenePart } from '../types/robotics';
import type { CheckContext } from './engineeringTypes';

export interface PowerSource {
  name: string;
  battery: BatterySpec;
}

export interface SceneRegulator {
  id: string;
  name: string;
  regulator: RegulatorSpec;
}

const componentOf = (p: ScenePart): ComponentInfo | undefined =>
  p.kind === 'component' && p.componentId ? COMPONENT_BY_ID[p.componentId] : undefined;

const isCell = (c: ComponentInfo) => !!c.battery?.cell;

function holderPack(comps: ComponentInfo[]): PowerSource | undefined {
  const holder = comps.find((c) => c.holder);
  const cell = holder && comps.find((c) => c.battery?.cell === holder.holder!.format);

  if (!holder?.holder || !cell?.battery) return undefined;

  const { cells, series } = holder.holder;
  const b = cell.battery;

  return {
    name: `${cells}× ${cell.name} in ${holder.name}`,
    battery: {
      nominalV: series ? b.nominalV * cells : b.nominalV,
      fullV: series ? b.fullV * cells : b.fullV,
      capacityAh: series ? b.capacityAh : b.capacityAh * cells,
      cRating: b.cRating,
    },
  };
}

function componentSources(parts: ScenePart[]): PowerSource[] {
  const comps = parts.map(componentOf).filter((c): c is ComponentInfo => !!c);
  const packs = comps.filter((c) => c.battery && !isCell(c));

  if (packs.length) return packs.map((c) => ({ name: c.name, battery: c.battery! }));

  const held = holderPack(comps);

  if (held) return [held];

  const cell = comps.find(isCell);

  return cell ? [{ name: cell.name, battery: cell.battery! }] : [];
}

function supplySources(ctx: CheckContext): PowerSource[] {
  const keys = [
    ...ctx.parts.filter((p) => p.supplyId).map((p) => p.supplyId!),
    ...(ctx.project.extras ?? []).filter((x) => x.key.startsWith('supply:')).map((x) => x.key.slice(7)),
  ];

  return keys.flatMap((k) => {
    const supply = SUPPLY_BY_ID[k];

    return supply?.battery ? [{ name: supply.name, battery: supply.battery }] : [];
  });
}

export const findPowerSources = (ctx: CheckContext): PowerSource[] => [
  ...componentSources(ctx.parts),
  ...supplySources(ctx),
];

export const findPowerSource = (ctx: CheckContext): PowerSource | undefined => findPowerSources(ctx)[0];

export function sceneRegulators(parts: ScenePart[]): SceneRegulator[] {
  return parts.flatMap((p) => {
    const c = componentOf(p);

    return c?.regulator ? [{ id: p.id, name: c.name, regulator: c.regulator }] : [];
  });
}
