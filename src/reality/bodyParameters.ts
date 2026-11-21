import type { SimModel } from '../sim/mjcfTypes';
import type { BodyFit } from './bodyTypes';

export interface BodyParameter {
  name: string;
  kind: 'massScales' | 'payloadKg' | 'floorFrictionScale';
  lower: number;
  upper: number;
}

export const emptyBodyFit = (): BodyFit => ({ massScales: {}, payloadKg: {}, floorFrictionScale: 1 });

export function bodyParameters(model: SimModel, robot: string): BodyParameter[] {
  const target = model.robots.find((r) => r.key === robot);
  const bodies = model.bodies.filter((b) => b.robot === robot && (b.joint || target?.floating));
  const masses: BodyParameter[] = bodies.map((b) => ({
    name: b.name,
    kind: 'massScales',
    lower: Math.log(0.25),
    upper: Math.log(4),
  }));
  const payloads: BodyParameter[] = bodies
    .filter((b) => model.bodyPayloads?.[b.name])
    .map((b) => ({ name: b.name, kind: 'payloadKg', lower: 0, upper: 20 }));
  const friction: BodyParameter[] = target?.floating
    ? [{ name: '', kind: 'floorFrictionScale', lower: Math.log(0.1), upper: Math.log(4) }]
    : [];

  return [...masses, ...payloads, ...friction];
}

export function unpackBodyParameters(params: BodyParameter[], values: number[]): BodyFit {
  const fit = emptyBodyFit();

  params.forEach((p, i) => {
    if (p.kind === 'floorFrictionScale') {
      fit.floorFrictionScale = Math.exp(values[i]);

      return;
    }

    fit[p.kind][p.name] = p.kind === 'payloadKg' ? values[i] * 0.1 : Math.exp(values[i]);
  });

  return fit;
}
