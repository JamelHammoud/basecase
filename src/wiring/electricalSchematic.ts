import { hashText } from '../utils/geometryHash';
import type { ElectricalEndpoint, ElectricalProjection } from './electricalTypes';
import { nodeKey } from './electricalGraph';
import { COMPONENT_BY_ID } from '../data/components';
import { POWER_MODULES } from './electricalModules';

const quoted = (value: string) => JSON.stringify(value);
const effects = '(effects (font (size 1.27 1.27)))';
const hidden = '(effects (font (size 1.27 1.27)) (hide yes))';

function valueOf(end: ElectricalEndpoint) {
  if (end.footprint) return end.name;

  const module = POWER_MODULES.find((candidate) => candidate.id === end.moduleId);
  const component = COMPONENT_BY_ID[end.componentId ?? ''];
  const variant = component?.variants?.find((candidate) => candidate.id === end.variant);

  return `${module?.mpn ?? variant?.mpn ?? component?.mpn ?? end.name} / ${end.port}`;
}

export function electricalUuid(value: string) {
  const blocks = [0, 1, 2, 3]
    .map((index) =>
      Number.parseInt(hashText(`${index}:${value}`), 36)
        .toString(16)
        .padStart(8, '0'),
    )
    .join('');

  return `${blocks.slice(0, 8)}-${blocks.slice(8, 12)}-4${blocks.slice(13, 16)}-8${blocks.slice(17, 20)}-${blocks.slice(20, 32)}`;
}

function properties(end: ElectricalEndpoint, x: number, y: number) {
  return [
    `(property "Reference" ${quoted(end.reference)} (at ${x} ${y - 5.08} 0) ${effects})`,
    `(property "Value" ${quoted(valueOf(end))} (at ${x} ${y - 2.54} 0) ${effects})`,
    ...Object.entries({
      ScenePart: end.partId ?? '',
      SceneName: end.name,
      Component: end.componentId ?? end.moduleId ?? '',
      SourcedItem: end.sourcedItemId ?? '',
      Variant: end.variant ?? '',
      Port: end.port,
      Datasheet: end.map?.source ?? '',
      Basis: end.map?.basis ?? 'manufacturer interface',
      ...(end.footprint ? { Footprint: `Robot:${end.footprint}` } : {}),
    }).map(([key, value]) => `(property ${quoted(key)} ${quoted(value)} (at ${x} ${y} 0) ${hidden})`),
  ].join('\n');
}

function librarySymbol(end: ElectricalEndpoint, embedded: boolean) {
  const name = `Interface_${end.reference}`;
  const id = embedded ? `Robot:${name}` : name;
  const pins = (end.map?.pins ?? [])
    .map(
      (pin, index) =>
        `(pin ${pin.direction} line (at -10.16 ${-index * 2.54} 0) (length 5.08) (name ${quoted(pin.name)} ${effects}) (number ${quoted(pin.number)} ${effects}))`,
    )
    .join('\n');

  return `(symbol ${quoted(id)} (pin_names (offset 1.016)) (in_bom no) (on_board ${end.offBoard ? 'no' : 'yes'})
    ${properties(end, 0, 0)}
    (symbol ${quoted(`${name}_0_1`)} (rectangle (start -5.08 2.54) (end 15.24 -10.16) (stroke (width 0) (type default)) (fill (type background))))
    (symbol ${quoted(`${name}_1_1`)} ${pins}))`;
}

function instance(end: ElectricalEndpoint, index: number, root: string) {
  const x = 30.48 + (index % 3) * 93.98;
  const y = 30.48 + Math.floor(index / 3) * 35.56;
  const pins = (end.map?.pins ?? [])
    .map((pin) => `(pin ${quoted(pin.number)} (uuid ${electricalUuid(`${end.reference}:pin:${pin.number}`)}))`)
    .join('\n');

  return {
    x,
    y,
    sexpr: `(symbol (lib_id ${quoted(`Robot:Interface_${end.reference}`)}) (at ${x} ${y} 0) (unit 1) (in_bom no) (on_board ${end.offBoard ? 'no' : 'yes'}) (dnp no)
      (uuid ${electricalUuid(end.reference)}) ${properties(end, x, y)} ${pins}
      (instances (project "robot" (path ${quoted(`/${root}`)} (reference ${quoted(end.reference)}) (unit 1)))))`,
  };
}

export function electricalSchematic(projection: ElectricalProjection) {
  const root = electricalUuid('robot');
  const netByPin = new Map(projection.nets.flatMap((net) => net.nodes.map((node) => [nodeKey(node), net.name])));
  const symbols = projection.endpoints.map((end, index) => {
    const item = instance(end, index, root);
    const labels = (end.map?.pins ?? []).flatMap((pin, pinIndex) => {
      const x = Number((item.x - 10.16).toFixed(4));
      const y = Number((item.y + pinIndex * 2.54).toFixed(4));

      if (end.map?.unused?.[pin.number])
        return [`(no_connect (at ${x} ${y}) (uuid ${electricalUuid(`${end.reference}:${pin.number}:unused`)}))`];

      const net = netByPin.get(nodeKey({ reference: end.reference, pin: pin.number }));

      if (!net) return [];

      return [
        `(label ${quoted(net)} (at ${x} ${y} 0) (effects (font (size 1.27 1.27)) (justify left bottom)) (uuid ${electricalUuid(`${end.reference}:${pin.number}:label`)}))`,
      ];
    });

    return [item.sexpr, ...labels].join('\n');
  });
  const height = Math.max(210, 60 + Math.ceil(symbols.length / 3) * 35.56);

  return {
    schematic: `(kicad_sch (version 20250114) (generator "basecase") (uuid ${root}) (paper "User" 350 ${height})
      (lib_symbols ${projection.endpoints.map((end) => librarySymbol(end, true)).join('\n')})
      (text "INCOMPLETE DRAFT - read requirements.json" (at 20.32 10.16 0) ${effects} (uuid ${electricalUuid('draft')}))
      ${symbols.join('\n')} (sheet_instances (path "/" (page "1"))))\n`,
    library: `(kicad_symbol_lib (version 20241209) (generator "basecase") ${projection.endpoints.map((end) => librarySymbol(end, false)).join('\n')})\n`,
  };
}
