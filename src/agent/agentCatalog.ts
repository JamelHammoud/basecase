import { ActuatorSpec, COMPONENTS, componentSize, hasComponentMesh } from '../data/components';
import { HARDWARE_TYPES, defaultDrive, driveOptions } from '../data/hardware';
import { SUPPLIES } from '../data/supplies';

type Component = (typeof COMPONENTS)[number];

type HardwareType = (typeof HARDWARE_TYPES)[number];

type Supply = (typeof SUPPLIES)[number];

const nm = (x?: number) => (x === undefined ? '?' : x.toFixed(2));
const act = (x: ActuatorSpec) =>
  `stall ${nm(x.stallNm)} N·m, rated ${nm(x.ratedNm ?? undefined)} N·m at ${x.atVolts} V (input ${x.volts[0]}–${x.volts[1]} V)${x.stallA ? `, stall ${x.stallA} A` : ''}`;

function componentActuatorLine(c: Component): string | null {
  if (c.variants?.length)
    return `  Versions (buy one; put it in the key): ${c.variants.map((v) => `component:${c.id}|${v.id} = ${v.label}${v.actuator ? `, ${act(v.actuator)}` : ''}`).join('; ')}`;

  return c.actuator ? `  Actuator: ${act(c.actuator)}` : null;
}

function componentLines(comps: Component[]): string[] {
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
      .map(([k, v]) => `${k} ${v}`)
      .join('; ');

    lines.push(
      `- component:${c.id} — ${c.name} · ${sz.width} × ${sz.depth} × ${sz.height} mm · ${specs} · Mounting: ${c.mounting}`,
    );

    const actuator = componentActuatorLine(c);

    if (actuator) lines.push(actuator);
  }

  return lines;
}

function hardwareLine(t: HardwareType): string {
  const drives = driveOptions(t.type);

  return `- hardware:${t.type} — ${t.name} (${t.description}); sizes ${t.sizes.join(', ')}${t.lengths ? '; lengths per size' : ''}${
    drives.length > 1 ? `; drives ${drives.join(', ')} (default ${defaultDrive(t.type)})` : ''
  }`;
}

const supplyLine = (x: Supply) =>
  `- supply:${x.id} — ${x.name} · ${x.spec}${x.weightG ? ` · about ${x.weightG} g` : ''}`;

export function agentCatalog(query = ''): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
  const comps = COMPONENTS.filter((c) => hasComponentMesh(c.id)).filter((c) =>
    matches(`${c.id} ${c.name} ${c.manufacturer} ${c.mpn} ${c.group} ${c.description} ${c.keywords ?? ''}`),
  );
  const hw = HARDWARE_TYPES.filter((t) =>
    matches(`hardware ${t.type} ${t.name} ${t.group} ${t.description} ${t.sizes.join(' ')}`),
  );
  const lines: string[] = comps.length ? componentLines(comps) : [];

  if (hw.length)
    lines.push(
      '',
      'Hardware (generated to ISO/DIN dimensions): hardware:<type>|<size>|<length mm>[|<finish>|<drive>], e.g. hardware:socket_head|M3|10, hardware:pan_head|M3|8|zinc|phillips, hardware:heat_insert|M3, hardware:bearing|608',
      ...hw.map(hardwareLine),
    );

  const supplies = SUPPLIES.filter((x) => matches(`supply ${x.id} ${x.name} ${x.group} ${x.spec}`));

  if (supplies.length)
    lines.push(
      '',
      'Supplies (bought, not modeled: batteries, power, wiring, filament). Add them to the BOM with set_build({ extras }), not add_parts; model the battery or converter bay around the spec size:',
      ...supplies.map(supplyLine),
    );

  if (!lines.length)
    return `Nothing in the catalog matches "${query}". Call find_parts with no query to see everything.`;

  return lines.join('\n');
}
