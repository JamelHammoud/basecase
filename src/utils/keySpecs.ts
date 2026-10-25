import { ComponentInfo, specLines } from '../data/components';

export interface KeySpec {
  label: string;
  value: string;
}

const spec = (c: ComponentInfo, ...labels: string[]) => {
  for (const l of labels) {
    const hit = c.specs.find(([label]) => label === l);

    if (hit) return specLines(hit[1])[0];
  }

  return undefined;
};

export const plainValue = (v: string) =>
  v
    .replace(/\s*\([^)]*\)/g, '')
    .split(/ @ | at /)[0]
    .replace(/,\s*IP\w+.*$/, '')
    .replace(/\s+(with|without) .*$/, '')
    .replace(/\s+(rated|peak|max|typical|manual)$/i, '')
    .trim();

function torqueKgcm(v: string): number | undefined {
  const m = v.match(/([\d.]+)\s*(kg·cm|kgf·cm|N·m|N·cm)(?!\/)/);

  if (!m) return undefined;

  const n = Number(m[1]);

  if (m[2] === 'N·m') return n * 10.197;

  if (m[2] === 'N·cm') return n * 0.10197;

  return n;
}

function strength(v: string | undefined): string | undefined {
  const kgcm = v ? torqueKgcm(v) : undefined;

  if (!kgcm) return undefined;

  const kg = kgcm / 10;
  const load = kg >= 1 ? `${Math.round(kg * 10) / 10} kg` : `${Math.max(10, Math.round(kg * 100) * 10)} g`;

  return `Up to ${load} at 10 cm`;
}

const amount = (v: string) => v.match(/^(Up to )?[<≈~]?\s*[\d.,]+(?:–[\d.,]+)?\s*(kg|g|mm|m)\b/i)?.[0];

const widest = (v: string) => {
  const m = v.match(/([\d.]+)\s*mm/g);

  return m ? m[m.length - 1].replace(/\s*mm/, ' mm') : undefined;
};

const round = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));

type Add = (label: string, value: string | undefined) => void;

function handSpecs(c: ComponentInfo, add: Add) {
  const payload = spec(c, 'Payload', 'Grasp load');
  const opening = spec(c, 'Stroke', 'Opening', 'Grip width');
  const joints = spec(c, 'DOF');

  if (payload && amount(plainValue(payload))) add('Can hold', amount(plainValue(payload)));
  else if (c.group === 'Grippers' && opening) add('Opens to', widest(plainValue(opening)));
  else if (c.group === 'Hands' && joints) add('Joints', plainValue(joints).match(/^\d+/)?.[0]);
}

function cameraSpecs(c: ComponentInfo, add: Add) {
  const mp = spec(c, 'Sensor')?.match(/([\d.]+)\s*MP/);

  if (mp) add('Resolution', `${mp[1]} MP`);
  else add('Field of view', plainValue(spec(c, 'Field of view', 'FOV') ?? ''));
}

const motorSpecs = (c: ComponentInfo, add: Add) =>
  add('Strength', strength(spec(c, 'Stall torque', 'Torque', 'Holding torque')));
const rangeSpecs = (c: ComponentInfo, add: Add) => add('Range', plainValue(spec(c, 'Range') ?? ''));

const firstSpec =
  (...pairs: Array<[from: string, to: string]>) =>
  (c: ComponentInfo, add: Add) => {
    const hit = pairs.find(([from]) => spec(c, from));

    if (hit) add(hit[1], plainValue(spec(c, hit[0])!));
  };

const sensorSpecs = firstSpec(['Range', 'Range'], ['Resolution', 'Resolution'], ['Operating force', 'Press force']);

function powerSpecs(c: ComponentInfo, add: Add) {
  if (c.battery) {
    add('Voltage', `${c.battery.nominalV} V`);
    add('Capacity', `${Math.round(c.battery.capacityAh * 1000)} mAh`);

    return;
  }

  if (c.regulator) add('Output', `${c.regulator.vout} V, ${c.regulator.ioutA} A`);
  else add('Holds', plainValue(spec(c, 'Holds') ?? ''));
}

const actuatorSpecs = (c: ComponentInfo, add: Add) => {
  add('Stroke', plainValue(spec(c, 'Stroke') ?? ''));
  add('Force', plainValue(spec(c, 'Force') ?? ''));
};

const mediaSpecs = firstSpec(['Screen', 'Screen'], ['Mics', 'Mics'], ['Power', 'Power'], ['Output', 'Output']);

const GROUP_SPECS: Partial<Record<ComponentInfo['group'], (c: ComponentInfo, add: Add, count: () => number) => void>> =
  {
    Servos: motorSpecs,
    Motors: motorSpecs,
    Hands: handSpecs,
    Grippers: handSpecs,
    Computers: (c, add) => add('Memory', plainValue(spec(c, 'RAM', 'Memory') ?? '').replace(/\s*LPDDR\w*/g, '')),
    Microcontrollers: (c, add) => add('Wireless', spec(c, 'Wireless') && plainValue(spec(c, 'Wireless')!)),
    Drivers: (c, add, count) => {
      add(
        'Drives',
        plainValue(spec(c, 'Outputs', 'Channels') ?? '')
          .replace(/^(\d+)×.*servo.*$/, '$1 servos')
          .replace(/brushed /, ''),
      );

      if (count() < 3) add('Runs on', plainValue(spec(c, 'Voltage') ?? ''));
    },
    Sensors: sensorSpecs,
    LiDAR: rangeSpecs,
    'Depth Cameras': (c, add) =>
      add('Range', plainValue(spec(c, 'Depth range', 'Range') ?? '').replace(/\s*ideal$/, '')),
    Cameras: cameraSpecs,
    Power: powerSpecs,
    Wheels: (c, add) => add('Diameter', plainValue(spec(c, 'Diameter') ?? '')),
    'Linear Actuators': actuatorSpecs,
    'Displays & Audio': mediaSpecs,
  };

export function keySpecs(c: ComponentInfo, size: { width: number; height: number; depth: number }): KeySpec[] {
  const out: KeySpec[] = [
    { label: 'Size', value: `${round(size.width)} × ${round(size.height)} × ${round(size.depth)} mm` },
  ];
  const weight = spec(c, 'Weight');

  if (weight) out.push({ label: 'Weight', value: plainValue(weight) });

  const add = (label: string, value: string | undefined) => {
    if (value) out.push({ label, value });
  };

  GROUP_SPECS[c.group]?.(c, add, () => out.length);

  return out.slice(0, 3);
}
