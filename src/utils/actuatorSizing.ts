import type { ActuatorBus } from '../data/components';
import {
  BUS_ADAPTERS,
  actuatorOptions,
  powerOptions,
  unitUsd,
  type ActuatorOption,
  type PowerOption,
} from './actuatorCatalog';
import {
  HEAT_LIMITS,
  HOLD_LIMITS,
  RMS_OF_STANCE,
  STANCE_LIMITS,
  holdVerdict,
  ratingAt,
  stanceVerdict,
  suitsVolts,
} from './actuatorRules';

const ITERATIONS = 3;

export interface SizingJoint {
  id: string;
  name: string;
  stanceNm?: number;
  holdNm: number;
  massG: number;
  leverMm?: number;
  servos: number;
  currentG: number;
  riders: string[];
}

export interface SizingInput {
  joints: SizingJoint[];
  totalG: number;
  options?: ActuatorOption[];
  power?: { batteries: PowerOption[]; regulators: PowerOption[] };
}

export interface Rail {
  name: string;
  volts: number;
  fullV: number;
  battery: PowerOption;
  regulator?: PowerOption;
}

export interface Fit {
  option: ActuatorOption;
  kind: 'stance' | 'hold';
  stallShare: number;
  heatShare: number;
}

export interface JointLoads {
  stanceNm?: number;
  holdNm: number;
}

export interface JointPick {
  joint: SizingJoint;
  loads: JointLoads;
  pick?: Fit;
  up?: Fit;
  strongest?: Fit;
}

export interface Family {
  bus: ActuatorBus;
  rail: Rail;
  picks: JointPick[];
  failures: JointPick[];
  actuatorsUsd: number;
  powerUsd: number;
  adapterUsd?: number;
  regulators: number;
  costUsd: number;
}

export function rails(power = powerOptions()): Rail[] {
  const out: Rail[] = [];

  for (const b of power.batteries) {
    const bat = b.battery!;

    out.push({ name: b.name, volts: bat.nominalV, fullV: bat.fullV, battery: b });

    for (const r of power.regulators) {
      const reg = r.regulator!;

      if (bat.fullV <= reg.vinMax && bat.nominalV >= reg.vinMin)
        out.push({ name: `${b.name} + ${r.name}`, volts: reg.vout, fullV: reg.vout, battery: b, regulator: r });
    }
  }

  return out;
}

const RANK = { pass: 0, warn: 1, fail: 2 };

export function ratingFor(j: SizingJoint, option: ActuatorOption, volts: number) {
  const rating = ratingAt(option.act, volts);

  return { ...rating, stallNm: rating.stallNm * j.servos, ratedNm: rating.ratedNm * j.servos };
}

function fitOf(j: SizingJoint, loads: JointLoads, option: ActuatorOption, volts: number): Fit & { ok: boolean } {
  const rating = ratingFor(j, option, volts);
  const hold = { kind: 'hold' as const, ...holdVerdict(loads.holdNm, rating) };
  const stance =
    loads.stanceNm === undefined ? hold : { kind: 'stance' as const, ...stanceVerdict(loads.stanceNm, rating) };
  const holdWorse = RANK[hold.status] - RANK[stance.status] || hold.stallShare - stance.stallShare;
  const worst = holdWorse > 0 ? hold : stance;

  return {
    option,
    kind: worst.kind,
    stallShare: worst.stallShare,
    heatShare: worst.heatShare,
    ok: worst.status === 'pass',
  };
}

function pickFor(j: SizingJoint, loads: JointLoads, options: ActuatorOption[], volts: number): JointPick {
  const fits = options.map((o) => fitOf(j, loads, o, volts));
  const passing = fits.filter((f) => f.ok);
  const pick = passing[0];
  const up = pick && passing.find((f) => f.option.act.stallNm > pick.option.act.stallNm * 1.05);
  const strongest = [...fits].sort((a, b) => a.stallShare - b.stallShare)[0];

  return { joint: j, loads, pick, up, strongest };
}

function deltaG(j: SizingJoint, p: JointPick | undefined): number {
  const grams = p?.pick?.option.grams;

  return grams ? j.servos * grams - j.currentG : 0;
}

const safeScale = (scale: number) => (Number.isFinite(scale) && scale > 0 ? scale : 1);

function scaledLoads(input: SizingInput, picks: Map<string, JointPick>): Map<string, JointLoads> {
  const delta = new Map(input.joints.map((j) => [j.id, deltaG(j, picks.get(j.id))]));
  const totalDelta = [...delta.values()].reduce((s, d) => s + d, 0);
  const whole = safeScale((input.totalG + totalDelta) / input.totalG);
  const out = new Map<string, JointLoads>();

  for (const j of input.joints) {
    const riders = j.riders.reduce((s, id) => s + (delta.get(id) ?? 0), 0);
    const limb = safeScale((j.massG + riders) / j.massG);

    out.set(j.id, { stanceNm: j.stanceNm === undefined ? undefined : j.stanceNm * whole, holdNm: j.holdNm * limb });
  }

  return out;
}

const currentA = (p: JointPick) => {
  const a = p.pick?.option.act;

  return a ? (a.ratedA ?? (a.stallA ?? 2) / 3) * p.joint.servos : 0;
};

function familyCost(bus: ActuatorBus, rail: Rail, picks: JointPick[]) {
  const actuatorsUsd = picks.reduce((s, p) => s + (p.pick ? p.pick.option.usd * p.joint.servos : 0), 0);
  const amps = picks.reduce((s, p) => s + currentA(p), 0);
  const regulators = rail.regulator ? Math.max(1, Math.ceil(amps / rail.regulator.regulator!.ioutA)) : 0;
  const powerUsd = rail.battery.usd + regulators * (rail.regulator?.usd ?? 0);
  const adapter = BUS_ADAPTERS[bus];
  const adapterUsd = adapter ? unitUsd(`component:${adapter}`) : undefined;

  return { actuatorsUsd, regulators, powerUsd, adapterUsd, costUsd: actuatorsUsd + powerUsd + (adapterUsd ?? 0) };
}

function evaluate(input: SizingInput, bus: ActuatorBus, rail: Rail): Family {
  const options = (input.options ?? actuatorOptions())
    .filter((o) => o.bus === bus && suitsVolts(o.act, rail.fullV) && suitsVolts(o.act, rail.volts))
    .sort((a, b) => a.usd - b.usd || b.act.stallNm - a.act.stallNm);
  let picks = new Map<string, JointPick>();

  for (let i = 0; i < ITERATIONS; i++) {
    const loads = scaledLoads(input, picks);

    picks = new Map(input.joints.map((j) => [j.id, pickFor(j, loads.get(j.id)!, options, rail.volts)]));
  }

  const list = input.joints.map((j) => picks.get(j.id)!);

  return { bus, rail, picks: list, failures: list.filter((p) => !p.pick), ...familyCost(bus, rail, list) };
}

export function sizeActuators(input: SizingInput): Family[] {
  const options = input.options ?? actuatorOptions();
  const buses = [...new Set(options.map((o) => o.bus))];
  const families = buses.flatMap((bus) => rails(input.power).map((rail) => evaluate({ ...input, options }, bus, rail)));
  const useful = families.filter((f) => f.picks.some((p) => p.pick));

  return useful.sort((a, b) => a.failures.length - b.failures.length || a.costUsd - b.costUsd);
}

export interface LoadCut {
  kind: 'stance' | 'hold';
  loadNm: number;
  shareKept: number;
  leverMm?: number;
  grams: number;
}

export function loadCut(p: JointPick, volts: number, totalG: number): LoadCut | undefined {
  if (!p.strongest) return undefined;

  const { stallNm, ratedNm } = ratingFor(p.joint, p.strongest.option, volts);
  const stance = p.strongest.kind === 'stance';
  const loadNm = stance ? p.loads.stanceNm! : p.loads.holdNm;
  const allowed = stance
    ? Math.min(STANCE_LIMITS.pass * stallNm, (HEAT_LIMITS.pass * ratedNm) / RMS_OF_STANCE)
    : Math.min(HOLD_LIMITS.pass * stallNm, ratedNm);
  const shareKept = Math.min(1, allowed / loadNm);
  const lever = stance ? p.joint.leverMm : undefined;

  return {
    kind: p.strongest.kind,
    loadNm,
    shareKept,
    leverMm: lever ? Math.abs(lever) * (1 - shareKept) : undefined,
    grams: (stance ? totalG : p.joint.massG) * (1 - shareKept),
  };
}
