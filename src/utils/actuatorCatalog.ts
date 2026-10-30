import {
  COMPONENTS,
  componentWeightG,
  type ActuatorBus,
  type ActuatorSpec,
  type BatterySpec,
  type RegulatorSpec,
} from '../data/components';
import { listPriceFor } from '../data/listPrices';

export const FEEDBACK_BUSES: ActuatorBus[] = ['feetech', 'dynamixel', 'hiwonder', 'can', 'rs485'];

export const BUS_ADAPTERS: Partial<Record<ActuatorBus, string>> = {
  feetech: 'waveshare-bus-servo-adapter-a',
  dynamixel: 'robotis-u2d2',
};

export interface ActuatorOption {
  key: string;
  name: string;
  bus: ActuatorBus;
  act: ActuatorSpec;
  usd: number;
  grams?: number;
}

export interface PowerOption {
  key: string;
  name: string;
  usd: number;
  battery?: BatterySpec;
  regulator?: RegulatorSpec;
}

export const unitUsd = (key: string): number | undefined => {
  const p = listPriceFor(key);

  return p ? p.usd / p.per : undefined;
};

function optionOf(key: string, name: string, act: ActuatorSpec, componentId: string): ActuatorOption | null {
  const usd = unitUsd(key);

  if (!act.bus || usd === undefined) return null;

  return { key, name, bus: act.bus, act, usd, grams: componentWeightG(componentId) };
}

export function actuatorOptions(buses: ActuatorBus[] = FEEDBACK_BUSES): ActuatorOption[] {
  const out: ActuatorOption[] = [];

  for (const c of COMPONENTS) {
    const entries = c.variants?.length
      ? c.variants.map((v) => ({ key: `component:${c.id}|${v.id}`, name: `${c.name} ${v.label}`, act: v.actuator }))
      : [{ key: `component:${c.id}`, name: c.name, act: c.actuator }];

    for (const e of entries) {
      const o = e.act ? optionOf(e.key, e.name, e.act, c.id) : null;

      if (o && buses.includes(o.bus)) out.push(o);
    }
  }

  return out.sort((a, b) => a.usd - b.usd);
}

export function powerOptions(): { batteries: PowerOption[]; regulators: PowerOption[] } {
  const priced = (key: string) => unitUsd(key) ?? 0;
  const batteries = COMPONENTS.filter((c) => c.battery && !c.battery.cell).map((c) => ({
    key: `component:${c.id}`,
    name: c.name,
    usd: priced(`component:${c.id}`),
    battery: c.battery,
  }));
  const regulators = COMPONENTS.filter((c) => c.regulator).map((c) => ({
    key: `component:${c.id}`,
    name: c.name,
    usd: priced(`component:${c.id}`),
    regulator: c.regulator,
  }));

  return { batteries, regulators };
}
