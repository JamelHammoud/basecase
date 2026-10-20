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

function componentSource(parts: ScenePart[]): PowerSource | undefined {
  const comps = parts.map(componentOf).filter((c): c is ComponentInfo => !!c);
  const pack = comps.find((c) => c.battery && !isCell(c));

  if (pack) return { name: pack.name, battery: pack.battery! };

  const held = holderPack(comps);

  if (held) return held;

  const cell = comps.find(isCell);

  return cell && { name: cell.name, battery: cell.battery! };
}

function supplySource(ctx: CheckContext): PowerSource | undefined {
  const keys = [
    ...ctx.parts.filter((p) => p.supplyId).map((p) => p.supplyId!),
    ...(ctx.project.extras ?? []).filter((x) => x.key.startsWith('supply:')).map((x) => x.key.slice(7)),
  ];
  const supply = keys.map((k) => SUPPLY_BY_ID[k]).find((s) => s?.battery);

  return supply && { name: supply.name, battery: supply.battery! };
}

export const findPowerSource = (ctx: CheckContext): PowerSource | undefined =>
  componentSource(ctx.parts) ?? supplySource(ctx);

export function sceneRegulators(parts: ScenePart[]): SceneRegulator[] {
  return parts.flatMap((p) => {
    const c = componentOf(p);

    return c?.regulator ? [{ id: p.id, name: c.name, regulator: c.regulator }] : [];
  });
}
