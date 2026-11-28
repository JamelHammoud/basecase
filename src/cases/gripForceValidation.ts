import { asNumber, optional, refuse } from './validate';

export function readForceProbeOptions(v: Record<string, unknown>, kind: string | undefined, where: string) {
  const force = kind === 'grip-force' || kind === 'grip-force-peak';
  const jaw = optional(asNumber, v.jaw, `${where}.jaw`);
  const ceilingN = optional(asNumber, v.ceilingN, `${where}.ceilingN`);

  if (jaw !== undefined && jaw !== 0 && jaw !== 1) refuse(`${where}.jaw`, 'must be 0 or 1');

  if ((jaw !== undefined || ceilingN !== undefined) && !force) refuse(where, 'requires a force probe');

  if (ceilingN !== undefined && (ceilingN <= 0 || jaw !== undefined))
    refuse(where, 'requires a positive total force ceiling');

  return { ...(jaw === undefined ? {} : { jaw }), ...(ceilingN === undefined ? {} : { ceilingN }) };
}
