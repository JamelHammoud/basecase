import { zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';
import { electricalProjection } from './electrical';
import { ELECTRICAL_PIN_MAPS } from './electricalPinMaps';
import { electricalSchematic } from './electricalSchematic';
import { electricalSourceJson } from './electricalSource';
import type { ElectricalInput } from './electricalTypes';
import { electricalFacts } from './electricalFacts';
import { POWER_MODULES } from './electricalModules';

export const KICAD_VALIDATOR_VERSION = '9.0.6';

async function fingerprint(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function electricalPackage(input: ElectricalInput) {
  const projection = electricalProjection(input);
  const source = electricalSourceJson({
    schema: 1,
    scene: projection.inputs,
    wiring: projection.wiring,
    pinMaps: input.pinMaps ?? ELECTRICAL_PIN_MAPS,
    walk: input.walk ?? null,
    calculationInputs: electricalFacts(input),
    powerBudget: projection.powerBudget,
    moduleMaps: POWER_MODULES,
  });
  const sourceFingerprint = await fingerprint(source);
  const { schematic, library } = electricalSchematic(projection);
  const report = {
    sourceFingerprint,
    validator: { name: 'kicad-cli', version: KICAD_VALIDATOR_VERSION, status: 'not-run' },
    projection,
    ruleExceptions: projection.endpoints.flatMap((end) =>
      Object.entries(end.map?.unused ?? {}).map(([pin, reason]) => ({ reference: end.reference, pin, reason })),
    ),
  };
  const files: Record<string, string> = {
    'README.txt':
      'Incomplete editable schematic draft. Read requirements.json before connecting hardware.\nKiCad ERC has not run on this export. Checks in Basecase remains the build verdict.\nConnector symbols reference existing modules and do not describe their internal circuitry.\nNo PCB, routing, power-integrity analysis or measured electrical performance is included.\nUse KiCad 9.0.6: kicad-cli sch erc robot.kicad_sch --format json --output erc.json\nExport connections: kicad-cli sch export netlist robot.kicad_sch --output robot.net\n',
    'requirements.json': electricalSourceJson(report, 2),
    'source.json': source,
    'robot.kicad_sch': schematic,
    'robot.kicad_sym': library,
    'robot.kicad_pro': JSON.stringify({ meta: { filename: 'robot.kicad_pro', version: 1 } }),
    'sym-lib-table':
      '(sym_lib_table (version 7) (lib (name "Robot") (type "KiCad") (uri "${KIPRJMOD}/robot.kicad_sym") (options "") (descr "Robot module interfaces")))\n',
  };
  const archive: Zippable = {};

  for (const [path, text] of Object.entries(files))
    archive[`robot/${path}`] = [new TextEncoder().encode(text), { mtime: new Date(2000, 0, 1) }];

  return { bytes: zipSync(archive), sourceFingerprint, files };
}
