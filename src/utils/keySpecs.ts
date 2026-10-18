import { ComponentInfo } from '../data/components';

/**
 * Up to three facts a newcomer can read at a glance: size, weight and the one number that
 * matters most for this kind of part, in plain words ("Up to 2 kg at 10 cm", not
 * "19.5 kg·cm @ 7.4 V (C001)"). The exact datasheet values stay in All specs.
 */

export interface KeySpec {
  label: string;
  value: string;
}

const spec = (c: ComponentInfo, ...labels: string[]) => {
  for (const l of labels) {
    const hit = c.specs.find(([label]) => label === l);
    if (hit) return hit[1];
  }
  return undefined;
};

/** The first option, without versions, conditions or ratings: "4–7.4 V (C001) · 4–14 V (C018)" → "4–7.4 V" */
export const plainValue = (v: string) =>
  v
    .split(' · ')[0]
    .replace(/\s*\([^)]*\)/g, '')
    .split(/ @ | at /)[0]
    .replace(/,\s*IP\w+.*$/, '')
    .replace(/\s+(with|without) .*$/, '')
    .replace(/\s+(rated|peak|max|typical|manual)$/i, '')
    .trim();

/** First torque in a spec, in kg·cm */
function torqueKgcm(v: string): number | undefined {
  // Not a constant like "Kt 0.055 N·m/A"
  const m = v.match(/([\d.]+)\s*(kg·cm|kgf·cm|N·m|N·cm)(?!\/)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (m[2] === 'N·m') return n * 10.197;
  if (m[2] === 'N·cm') return n * 0.10197;
  return n;
}

/** Torque as the load it holds on a 10 cm arm: 19.5 kg·cm → "Up to 2 kg at 10 cm" */
function strength(v: string | undefined): string | undefined {
  const kgcm = v ? torqueKgcm(v) : undefined;
  if (!kgcm) return undefined;
  const kg = kgcm / 10;
  const load = kg >= 1 ? `${Math.round(kg * 10) / 10} kg` : `${Math.max(10, Math.round(kg * 100) * 10)} g`;
  return `Up to ${load} at 10 cm`;
}

/** Just the amount: "7 kg force-fit" → "7 kg", "Up to 1 kg" stays */
const amount = (v: string) => v.match(/^(Up to )?[<≈~]?\s*[\d.,]+(?:–[\d.,]+)?\s*(kg|g|mm|m)\b/i)?.[0];

/** The widest opening: "0–70 mm" → "70 mm" */
const widest = (v: string) => {
  const m = v.match(/([\d.]+)\s*mm/g);
  return m ? m[m.length - 1].replace(/\s*mm/, ' mm') : undefined;
};

const round = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));

export function keySpecs(c: ComponentInfo, size: { width: number; height: number; depth: number }): KeySpec[] {
  const out: KeySpec[] = [{ label: 'Size', value: `${round(size.width)} × ${round(size.height)} × ${round(size.depth)} mm` }];
  const weight = spec(c, 'Weight');
  if (weight) out.push({ label: 'Weight', value: plainValue(weight) });

  const add = (label: string, value: string | undefined) => {
    if (value) out.push({ label, value });
  };
  switch (c.group) {
    case 'Servos':
    case 'Motors':
      add('Strength', strength(spec(c, 'Stall torque', 'Torque', 'Holding torque')));
      break;
    case 'Hands':
    case 'Grippers': {
      const payload = spec(c, 'Payload', 'Grasp load');
      const opening = spec(c, 'Stroke', 'Opening', 'Grip width');
      const joints = spec(c, 'DOF');
      if (payload && amount(plainValue(payload))) add('Can hold', amount(plainValue(payload)));
      else if (c.group === 'Grippers' && opening) add('Opens to', widest(plainValue(opening)));
      else if (c.group === 'Hands' && joints) add('Joints', plainValue(joints).match(/^\d+/)?.[0]);
      break;
    }
    case 'Computers':
      add('Memory', plainValue(spec(c, 'RAM', 'Memory') ?? '').replace(/\s*LPDDR\w*/g, ''));
      break;
    case 'Microcontrollers':
      add('Wireless', spec(c, 'Wireless') && plainValue(spec(c, 'Wireless')!));
      break;
    case 'Drivers':
      // "16× 3-pin servo headers" → "16 servos", "2 brushed DC motors" → "2 DC motors"
      add(
        'Drives',
        plainValue(spec(c, 'Outputs', 'Channels') ?? '')
          .replace(/^(\d+)×.*servo.*$/, '$1 servos')
          .replace(/brushed /, '')
      );
      if (out.length < 3) add('Runs on', plainValue(spec(c, 'Voltage') ?? ''));
      break;
    case 'Sensors':
    case 'LiDAR':
      add('Range', plainValue(spec(c, 'Range') ?? ''));
      break;
    case 'Depth Cameras':
      add('Range', plainValue(spec(c, 'Depth range', 'Range') ?? '').replace(/\s*ideal$/, ''));
      break;
    case 'Cameras': {
      const mp = spec(c, 'Sensor')?.match(/([\d.]+)\s*MP/);
      if (mp) add('Resolution', `${mp[1]} MP`);
      else add('Field of view', plainValue(spec(c, 'Field of view', 'FOV') ?? ''));
      break;
    }
  }
  return out.slice(0, 3);
}
