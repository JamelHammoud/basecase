import { specToPart } from '../agent/agentScene';
import { booleanPart } from '../booleans/parts';
import { prepareParameterEdit } from '../utils/designParameters/transaction';
import { regenerateParameterBooleans } from '../utils/designParameters/booleanGeometry';
import { regenerateParameterGeometry } from '../utils/designParameters/geometry';
import type { ScenePart } from '../types/robotics';

export const FIT_INTERFACES = [
  { name: 'Screw clearance', width: 3.2, round: true, catalog: 'hardware:socket_head|M3|12' },
  { name: 'Bearing seat', width: 22, round: true, catalog: 'hardware:bearing|608' },
  { name: 'Servo pocket', width: 45.2, round: false, catalog: 'component:feetech-sts3215|c001' },
  { name: 'Motor pocket', width: 42.3, round: false, catalog: 'component:nema17-17hs4401' },
  { name: 'Heat-insert bore', width: 4, round: true, catalog: 'hardware:heat_insert|M3|4' },
  { name: 'Shaft bore', width: 8, round: true, catalog: 'hardware:shaft|8|10' },
  { name: 'Alignment pin', width: 5, round: true, catalog: 'hardware:dowel_pin|5|10' },
  { name: 'Sliding rail', width: 12, round: false },
  { name: 'Keyed hub', width: 10, round: true },
  { name: 'Removable enclosure lip', width: 32, round: false },
];

export const fitServices = {
  compile: async () => {
    throw new Error('Unexpected CAD compilation');
  },
  regenerate: regenerateParameterGeometry,
  isCurrent: () => true,
};

export async function generatedFit(design = FIT_INTERFACES[1], rotated = false) {
  const rotation: [number, number, number] = rotated ? [25, 40, 15] : [0, 0, 0];
  const base = { ...specToPart({ id: 'base', shape: 'box', size: [80, 80, 12], position: [0, 0, 0] }), rotation };
  const tool: ScenePart = {
    ...specToPart({
      id: 'bore',
      name: 'Interface bore',
      position: [0, 0, 0],
      shape: design.round ? 'cylinder' : 'box',
    }),
    dimensions: { width: design.width, depth: design.name === 'Sliding rail' ? 90 : design.width, height: 20 },
    rotation,
    dimensionBindings: (design.name === 'Sliding rail' ? ['width'] : ['width', 'depth']).map((target) => ({
      kind: 'primitive',
      target,
      unit: 'mm',
      expression: 'bore',
    })),
  };
  const key = { ...specToPart({ id: 'key', shape: 'box', size: [3, 5, 20], position: [0, -design.width / 2, 0] }) };
  const cutter =
    design.name === 'Keyed hub' ? booleanPart({ id: 'keyway', base: tool, tools: [key], op: 'union' }) : tool;
  const root: ScenePart = {
    ...booleanPart({ id: 'host', base, tools: [cutter], op: 'subtract' }),
    name: design.name,
    mechanicalTag: '3D Printed PLA/PETG',
    printMaterial: 'PETG',
    print: { down: [1, 0, 0] },
  };
  const fit = design.catalog
    ? specToPart({ id: 'mate', position: [0, 0, 0], catalog: design.catalog })
    : {
        ...specToPart({ id: 'mate', position: [0, 0, 0], shape: design.round ? 'cylinder' : 'box' }),
        dimensions: { width: design.width, depth: design.name === 'Sliding rail' ? 90 : design.width, height: 10 },
      };

  const lip = specToPart({ id: 'lip', shape: 'box', size: [36, 36, 2], position: [0, 0, 6] });
  const references: Record<string, ScenePart> = {
    'Keyed hub': booleanPart({
      id: 'mate',
      base: { ...fit, id: 'shaft' },
      tools: [{ ...key, id: 'mate-key' }],
      op: 'union',
    }),
    'Removable enclosure lip': booleanPart({ id: 'mate', base: { ...fit, id: 'plug' }, tools: [lip], op: 'union' }),
  };
  const reference = (
    await regenerateParameterBooleans([references[design.name] ?? fit], [references[design.name] ?? fit])
  )[0];
  const result = await prepareParameterEdit(
    {
      parts: [
        { ...root, rotation: rotated ? [25, 40, 15] : [0, 0, 0] },
        { ...reference, rotation: rotated ? [25, 40, 15] : [0, 0, 0] },
      ],
      parameters: [{ name: 'bore', unit: 'mm', value: design.width }],
    },
    { ...fitServices, verify: true },
  );

  return JSON.parse(JSON.stringify(result)) as typeof result;
}
