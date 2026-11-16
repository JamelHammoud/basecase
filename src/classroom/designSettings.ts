import { MATERIAL_DENSITY } from '../data/supplies';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { asNumber, asRecord, asString, refuse } from '../cases/validate';

export type ClassroomDesign = Pick<ProjectSettings, 'material' | 'infillPct' | 'tether'>;

export function classroomDesign(value: unknown = DEFAULT_PROJECT): ClassroomDesign {
  const record = asRecord(value, 'Robot settings');
  const material = asString(record.material, 'Material');
  const infillPct = asNumber(record.infillPct, 'Infill');

  if (!Object.hasOwn(MATERIAL_DENSITY, material) || infillPct < 0 || infillPct > 100)
    return refuse('Robot settings', 'need a supported material and infill from 0 to 100.');

  const design: ClassroomDesign = { material: material as ClassroomDesign['material'], infillPct };

  if (record.tether === undefined) return design;

  const tether = asRecord(record.tether, 'Power supply');
  const volts = asNumber(tether.volts, 'Voltage');
  const amps = asNumber(tether.amps, 'Current');

  if (volts <= 0 || volts > 1000 || amps <= 0 || amps > 1000)
    return refuse('Power supply', 'needs positive voltage and current up to 1,000.');

  return { ...design, tether: { volts, amps } };
}
