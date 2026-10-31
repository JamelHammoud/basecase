import type { CheckRow, EngineeringReport } from './engineeringTypes';
import { formatWhole } from './currencyStore';
import { prettyJointName } from './kinematics';

export interface SweepSim {
  fellAt: number | null;
  worstShare?: number;
  worstJoint?: string;
}

export interface SweepMetrics {
  massG: number;
  torque: CheckRow['status'];
  worstShare?: number;
  worstJoint?: string;
  servosUsd?: number;
  sizedUsd?: number;
  tipDeg?: number;
  sim?: SweepSim | string;
}

export interface SweepRow {
  label: string;
  metrics: SweepMetrics;
}

export function reportMetrics(
  report: EngineeringReport,
  costs: Pick<SweepMetrics, 'servosUsd' | 'sizedUsd'> = {},
): SweepMetrics {
  const known = report.joints.filter((l) => l.stallShare !== undefined);
  const worst = [...known].sort((a, b) => b.stallShare! - a.stallShare!)[0];

  return {
    massG: report.massG,
    torque: report.rows.find((r) => r.check === 'Servo torque')?.status ?? 'not run',
    worstShare: worst?.stallShare,
    worstJoint: worst && prettyJointName(worst.joint.name),
    ...costs,
    tipDeg: report.stability?.tipDeg,
  };
}

const MARK: Record<CheckRow['status'], string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', 'not run': 'NOT RUN' };

type Fmt = (v: number) => string;

const signed = (d: number, fmt: Fmt) => `${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))}`;

function withDelta(v: number | undefined, base: number | undefined, fmt: Fmt): string {
  if (v === undefined) return '—';

  const delta = base === undefined ? '' : signed(v - base, fmt);

  return !delta || signed(0, fmt) === delta.replace('−', '+') ? fmt(v) : `${fmt(v)} (${delta})`;
}

const share: Fmt = (v) => v.toFixed(2);
const usd: Fmt = (v) => formatWhole(v);
const tip: Fmt = (v) => `${v.toFixed(1)}°`;
const grams: Fmt = (v) => `${Math.round(v)} g`;

function simCell(sim: SweepMetrics['sim'], base: SweepMetrics['sim']): string {
  if (sim === undefined) return '—';

  if (typeof sim === 'string') return sim;

  const baseShare = typeof base === 'object' ? base.worstShare : undefined;
  const stood = sim.fellAt === null ? 'stood' : `fell at ${sim.fellAt.toFixed(1)} s`;
  const where = sim.worstJoint ? ` ${sim.worstJoint}` : '';

  return `${stood},${where} ${withDelta(sim.worstShare, baseShare, share)}`;
}

function cells(m: SweepMetrics, base: SweepMetrics): string[] {
  const torque = `${MARK[m.torque]} ${m.worstJoint ?? ''} ${withDelta(m.worstShare, base.worstShare, share)}`;

  return [
    withDelta(m.massG, base.massG, grams),
    torque.replace(/\s+/g, ' '),
    withDelta(m.servosUsd, base.servosUsd, usd),
    withDelta(m.sizedUsd, base.sizedUsd, usd),
    withDelta(m.tipDeg, base.tipDeg, tip),
    simCell(m.sim, base.sim),
  ];
}

export function sweepTable(base: SweepRow, rows: SweepRow[]): string {
  const head = [
    'Value',
    'Mass',
    'Servo torque (worst, share of stall)',
    'Servos as chosen',
    'Cheapest passing set',
    'Tips past',
    'Hold + shoves (worst p99, share of stall)',
  ];
  const line = (c: string[]) => `| ${c.join(' | ')} |`;

  return [
    line(head),
    line(head.map(() => '---')),
    line([`${base.label} (now)`, ...cells(base.metrics, base.metrics)]),
    ...rows.map((r) => line([r.label, ...cells(r.metrics, base.metrics)])),
  ].join('\n');
}
