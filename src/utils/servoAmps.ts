import { actuatorOf, type ActuatorSpec } from '../data/components';
import type { ScenePart } from '../types/robotics';
import { ratingAt } from './actuatorRules';
import type { JointLoad, WalkPower } from './engineeringTypes';
import type { PeakSpan, TorqueSeries } from './peakTorque';

export const IDLE_A = 0.15;
export const STALL_A = 2;

export interface AmpModel {
  idleA: number;
  perNmA: number;
}

export const ampsAt = (m: AmpModel, nm: number) => m.idleA + m.perNmA * Math.abs(nm);

function actuatorAmps(act: ActuatorSpec | undefined, volts: number | undefined, stallNm: number): AmpModel {
  const idleA = act?.idleA ?? IDLE_A;

  if (act?.fit) return { idleA, perNmA: 1 / act.fit.kt };

  const stall = act ? ratingAt(act, volts).stallNm : stallNm;

  return { idleA, perNmA: stall > 0 ? Math.max(0, (act?.stallA ?? STALL_A) - idleA) / stall : 0 };
}

export function jointAmpModel(specs: Array<ActuatorSpec | undefined>, rating: { volts?: number; stallNm: number }) {
  const each = specs.map((a) => actuatorAmps(a, rating.volts, rating.stallNm / specs.length));

  return {
    idleA: each.reduce((s, m) => s + m.idleA, 0),
    perNmA: each.reduce((s, m) => s + m.perNmA, 0) / specs.length,
  };
}

export function walkAmpModels(loads: JointLoad[], parts: ScenePart[]): Record<string, AmpModel> {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const specOf = (id: string) => {
    const p = byId.get(id);

    return p?.componentId ? actuatorOf(p.componentId, p.componentVariant) : undefined;
  };

  return Object.fromEntries(
    loads.flatMap((l) => {
      const ids = l.joint.actuators ?? [];

      return ids.length
        ? [[l.joint.id, jointAmpModel(ids.map(specOf), { volts: l.volts, stallNm: l.stallNm ?? 0 })]]
        : [];
    }),
  );
}

const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

export function walkPower(series: TorqueSeries, jointIds: string[], span: Pick<PeakSpan, 'settleS'>): WalkPower {
  const from = Math.ceil(span.settleS / series.windowS);
  const measured = jointIds.flatMap((id, i) => {
    const amps = series.amps?.[i]?.slice(from) ?? [];

    return amps.length ? [{ id, amps }] : [];
  });
  const windows = Math.min(...measured.map((j) => j.amps.length));
  const bus = Number.isFinite(windows)
    ? Array.from({ length: windows }, (_, w) => measured.reduce((s, j) => s + j.amps[w], 0))
    : [];

  return {
    avgA: mean(bus),
    peakA: bus.length ? Math.max(...bus) : 0,
    joints: Object.fromEntries(measured.map((j) => [j.id, { avgA: mean(j.amps), peakA: Math.max(...j.amps) }])),
  };
}
