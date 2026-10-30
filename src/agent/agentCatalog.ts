import { ActuatorSpec, COMPONENTS, componentSize, hasComponentMesh, specLines } from '../data/components';
import { HARDWARE_TYPES, defaultDrive, driveOptions } from '../data/hardware';
import { SUPPLIES } from '../data/supplies';
import { componentPorts } from '../data/componentPorts';
import { catalogPortLines } from './ports';
import { actuatorValue, catalogHeader, hardwarePrices, priceText, type CatalogContext } from './agentCatalogPrices';

export type { CatalogContext } from './agentCatalogPrices';

type Component = (typeof COMPONENTS)[number];

type HardwareType = (typeof HARDWARE_TYPES)[number];

type Supply = (typeof SUPPLIES)[number];

const nm = (x: number) => x.toFixed(2);
const act = (x: ActuatorSpec) =>
  `${x.peak ? 'peak' : 'stall'} ${nm(x.stallNm)} N·m${x.ratedNm === undefined ? '' : `, rated ${nm(x.ratedNm)} N·m`} at ${x.atVolts} V (input ${x.volts[0]}–${x.volts[1]} V)${x.rpm ? `, ${x.rpm} rpm` : ''}${x.stallA ? `, stall ${x.stallA} A` : ''}`;

function versionText(c: Component, v: NonNullable<Component['variants']>[number], ctx?: CatalogContext): string {
  const key = `component:${c.id}|${v.id}`;
  const linear = v.linear ? `, ${v.linear.forceN} N max, ${v.linear.mmPerS} mm/s` : '';
  const price = v.actuator ? actuatorValue(v.actuator, key, ctx) : priceText(key, ctx);

  return `${key} = ${v.label}${v.actuator ? `, ${act(v.actuator)}` : ''}${linear} · ${price}`;
}

function componentActuatorLine(c: Component, ctx?: CatalogContext): string | null {
  if (c.variants?.length)
    return `  Versions (buy one; put it in the key): ${c.variants.map((v) => versionText(c, v, ctx)).join('; ')}`;

  return c.actuator ? `  Actuator: ${act(c.actuator)} · ${actuatorValue(c.actuator, `component:${c.id}`, ctx)}` : null;
}

const componentPrice = (c: Component, ctx?: CatalogContext) =>
  c.variants?.length || c.actuator ? '' : ` · ${priceText(`component:${c.id}`, ctx)}`;

function componentPowerLine(c: Component): string | null {
  if (c.battery)
    return `  Battery: ${c.battery.nominalV} V nominal, ${c.battery.fullV} V charged, ${c.battery.capacityAh} Ah, ${c.battery.cRating}C continuous${c.battery.cell ? ` (one ${c.battery.cell} cell)` : ''}`;

  if (c.regulator)
    return `  Regulator: ${c.regulator.vinMin}–${c.regulator.vinMax} V in, ${c.regulator.vout} V out, ${c.regulator.ioutA} A`;

  return c.holder
    ? `  Holds ${c.holder.cells}× ${c.holder.format} ${c.holder.series ? 'in series' : 'in parallel'}; add the cells too`
    : null;
}

function componentPortLine(c: Component): string | null {
  const ports = componentPorts(c.id);

  return ports.length
    ? `  Ports (from the part's position at rotation [0, 0, 0], Z up; use with mate and fasten): ${catalogPortLines(ports).join('; ')}`
    : null;
}

function componentLines(comps: Component[], ctx?: CatalogContext): string[] {
  const lines = [
    'Components (exact manufacturer geometry; size is x × y × z in mm as placed with rotation [0, 0, 0]):',
  ];
  let group = '';

  for (const c of comps) {
    if (c.group !== group) {
      group = c.group;
      lines.push(`${group}:`);
    }

    const sz = componentSize(c.id);
    const specs = c.specs
      .slice(0, 3)
      .map(([k, v]) => `${k} ${specLines(v).join(', ')}`)
      .join('; ');

    lines.push(
      `- component:${c.id} — ${c.name} · ${sz.width} × ${sz.depth} × ${sz.height} mm · ${specs}${componentPrice(c, ctx)} · Mounting: ${c.mounting}`,
    );

    for (const extra of [componentActuatorLine(c, ctx), componentPowerLine(c), componentPortLine(c)])
      if (extra) lines.push(extra);
  }

  return lines;
}

function lengthsNote(t: HardwareType): string {
  if (!t.lengths) return '';

  if (!t.stockOnly) return '; lengths per size';

  const perSize = t.sizes.map((s) => `${s} ${t.lengths!(s).join('/')}`).join(', ');

  return `; stock lengths only (${perSize} mm; omit for the standard length)`;
}

function hardwareLine(t: HardwareType, ctx?: CatalogContext): string {
  const drives = driveOptions(t.type);

  return `- hardware:${t.type} — ${t.name} (${t.description}); sizes ${t.sizes.join(', ')}${lengthsNote(t)}${
    drives.length > 1 ? `; drives ${drives.join(', ')} (default ${defaultDrive(t.type)})` : ''
  }${hardwarePrices(t.type, ctx)}`;
}

const supplyLine = (x: Supply, ctx?: CatalogContext) =>
  `- supply:${x.id} — ${x.name} · ${x.spec}${x.weightG ? ` · about ${x.weightG} g` : ''} · ${priceText(`supply:${x.id}`, ctx)}`;

export function agentCatalog(query = '', ctx?: CatalogContext): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
  const comps = COMPONENTS.filter((c) => hasComponentMesh(c.id)).filter((c) =>
    matches(`${c.id} ${c.name} ${c.manufacturer} ${c.mpn} ${c.group} ${c.description} ${c.keywords ?? ''}`),
  );
  const hw = HARDWARE_TYPES.filter((t) =>
    matches(`hardware ${t.type} ${t.name} ${t.group} ${t.description} ${t.sizes.join(' ')}`),
  );
  const lines: string[] = comps.length ? componentLines(comps, ctx) : [];

  if (hw.length)
    lines.push(
      '',
      'Hardware (generated to ISO/DIN or maker catalog dimensions): hardware:<type>|<size>|<length mm>[|<finish>|<drive>], e.g. hardware:socket_head|M3|10, hardware:pan_head|M3|8|zinc|phillips, hardware:heat_insert|M3|4, hardware:bearing|608, hardware:extrusion|2020|300, hardware:linear_rail|MGN12|245, hardware:gt2_pulley|20T-5',
      ...hw.map((t) => hardwareLine(t, ctx)),
    );

  const supplies = SUPPLIES.filter((x) => matches(`supply ${x.id} ${x.name} ${x.group} ${x.spec}`));

  if (supplies.length)
    lines.push(
      '',
      'Supplies (bought, not modeled: wiring, chargers, filament, tools). Add them to the BOM with set_build({ extras }), not add_parts. Batteries, cell holders and regulators with exact shapes are Power components (find_parts power); place those with add_parts:',
      ...supplies.map((x) => supplyLine(x, ctx)),
    );

  if (!lines.length)
    return `Nothing in the catalog matches "${query}". Call find_parts with no query to see everything.`;

  return [...catalogHeader(ctx), ...lines].join('\n');
}
