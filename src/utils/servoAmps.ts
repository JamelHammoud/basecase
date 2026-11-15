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

interface MeasuredAmps {
  id: string;
  amps: number[];
  from: number;
  sumA: number;
  peakA: number;
}

function addAmps(joint: MeasuredAmps, amps: number) {
  joint.sumA += amps;
  joint.peakA = Math.max(joint.peakA, amps);
}

function jointPower(joint: MeasuredAmps, windows: number) {
  for (let w = joint.from + windows; w < joint.amps.length; w++) addAmps(joint, joint.amps[w]);

  return [joint.id, { avgA: joint.sumA / (joint.amps.length - joint.from), peakA: joint.peakA }];
}

export function walkPower(series: TorqueSeries, jointIds: string[], span: Pick<PeakSpan, 'settleS'>): WalkPower {
  const from = Math.ceil(span.settleS / series.windowS);
  const measured = jointIds.flatMap((id, i) => {
    const amps = series.amps?.[i];

    if (!amps) return [];

    const start = from < 0 ? Math.max(amps.length + from, 0) : Math.min(from || 0, amps.length);

    return start < amps.length ? [{ id, amps, from: start, sumA: 0, peakA: Number.NEGATIVE_INFINITY }] : [];
  });

  if (!measured.length) return { avgA: 0, peakA: 0, joints: {} };

  const windows = measured.reduce((n, j) => Math.min(n, j.amps.length - j.from), Number.POSITIVE_INFINITY);
  let sumA = 0;
  let peakA = Number.NEGATIVE_INFINITY;

  for (let w = 0; w < windows; w++) {
    let busA = 0;

    for (const joint of measured) {
      const amps = joint.amps[joint.from + w];

      addAmps(joint, amps);
      busA += amps;
    }

    sumA += busA;
    peakA = Math.max(peakA, busA);
  }

  return {
    avgA: sumA / windows,
    peakA,
    joints: Object.fromEntries(measured.map((joint) => jointPower(joint, windows))),
  };
}
