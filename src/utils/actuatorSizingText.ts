import type { ActuatorBus } from '../data/components';
import { loadCut, type Family, type Fit, type JointLoads, type JointPick } from './actuatorSizing';

const BUS_NAMES: Record<ActuatorBus, string> = {
  feetech: 'Feetech serial bus',
  dynamixel: 'Dynamixel bus',
  hiwonder: 'Hiwonder serial bus',
  can: 'CAN',
  rs485: 'RS-485',
  pwm: 'PWM',
  dc: 'DC motor driver',
};

const ALTERNATIVES = 3;

const money = (n: number) => `$${n.toFixed(2)}`;
const whole = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const volts = (v: number) => `${Math.round(v * 10) / 10} V`;

const fitText = (f: Fit) =>
  `${f.option.name} ${money(f.option.usd)} (${f.stallShare.toFixed(2)} of stall, ${f.heatShare.toFixed(2)}× rated)`;

function supplyText(f: Family): string {
  const regs = f.regulators ? ` + ${f.regulators}× ${f.rail.regulator!.name}` : '';
  const adapter = f.adapterUsd === undefined ? '; add a bus adapter (none in the catalog)' : ', bus adapter';

  return `${f.rail.battery.name}${regs}${adapter}`;
}

function familyHeader(f: Family): string {
  const what = f.failures.length
    ? `Cheapest set, but ${f.failures.length} joints pass with nothing in it`
    : 'Cheapest set where every joint passes Stance and Heat';

  return (
    `${what}: ≈ ${whole(f.costUsd)} on the ${BUS_NAMES[f.bus]} at ${volts(f.rail.volts)} (${supplyText(f)}). ` +
    `Actuators ${whole(f.actuatorsUsd)}, power ${whole(f.powerUsd)}${f.adapterUsd === undefined ? '' : `, adapter ${money(f.adapterUsd)}`}.`
  );
}

function loadWords(loads: JointLoads): string {
  const hold = `${loads.holdNm.toFixed(2)} N·m holding`;

  return loads.stanceNm === undefined ? hold : `${loads.stanceNm.toFixed(2)} N·m in stance, ${hold}`;
}

function groupKey(p: JointPick): string {
  const round = (v?: number) => (v === undefined ? '' : Math.round(v * 20));

  return [p.pick?.option.key, p.up?.option.key, round(p.loads.stanceNm), round(p.loads.holdNm)].join('|');
}

function pickLine(group: JointPick[]): string {
  const p = group[0];
  const names = group.map((g) => g.joint.name).join(', ');
  const count = group.length * p.joint.servos > 1 ? ` ×${group.length * p.joint.servos}` : '';

  if (!p.pick) return `- ${names}: ${loadWords(p.loads)} → nothing in this family passes`;

  return `- ${names}: ${loadWords(p.loads)} → ${fitText(p.pick)}${count}${p.up ? `; one tier up: ${fitText(p.up)}` : ''}`;
}

function grouped(picks: JointPick[]): JointPick[][] {
  const groups = new Map<string, JointPick[]>();

  for (const p of picks) groups.set(groupKey(p), [...(groups.get(groupKey(p)) ?? []), p]);

  return [...groups.values()];
}

function cutLine(p: JointPick, f: Family, totalG: number): string {
  const cut = loadCut(p, f.rail.volts, totalG);

  if (!cut || !p.strongest) return `- ${p.joint.name}: no actuator in this family fits`;

  const stance = cut.kind === 'stance';
  const ways = [
    cut.leverMm ? `shorten the leg segment under it by ${Math.ceil(cut.leverMm)} mm` : '',
    `carry ${Math.ceil(cut.grams)} g less${stance ? ' in the whole robot' : ' beyond it'}`,
  ].filter(Boolean);

  return `- ${p.joint.name}: needs ${cut.loadNm.toFixed(2)} N·m ${stance ? 'in stance' : 'holding'}; the strongest, ${p.strongest.option.name}, passes if that drops ${Math.round((1 - cut.shareKept) * 100)}%: ${ways.join(', or ')}`;
}

function alternativeLine(f: Family): string {
  const fails = f.failures.length ? `, ${f.failures.length} joints don’t pass` : '';

  return `- ${BUS_NAMES[f.bus]} at ${volts(f.rail.volts)} (${f.rail.name}): ≈ ${whole(f.costUsd)}${fails}`;
}

function otherFamilies(families: Family[]): Family[] {
  const best = families[0];
  const seen = new Set([`${best.bus}`]);
  const out: Family[] = [];

  for (const f of families.slice(1)) {
    if (seen.has(f.bus) || out.length >= ALTERNATIVES) continue;

    seen.add(f.bus);
    out.push(f);
  }

  return out;
}

export function sizingText(families: Family[], totalG: number): string {
  const best = families[0];

  if (!best) return 'No priced actuator with position feedback suits any battery in the catalog.';

  const others = otherFamilies(families);
  const lines = [familyHeader(best), '', 'Per joint (load → cheapest that passes, with its margin):'];

  lines.push(...grouped(best.picks).map(pickLine));

  if (best.failures.length)
    lines.push('', 'Lower the load where nothing passes:', ...best.failures.map((p) => cutLine(p, best, totalG)));

  if (others.length) lines.push('', 'Cheapest set on other buses:', ...others.map(alternativeLine));

  lines.push(
    '',
    'Loads are this app’s model: the whole robot on one leg at the gait’s crouch for leg joints, the limb held out across its range for the rest. Peak landing loads need a walking simulation. Prices are list prices; never quote one that isn’t here or in get_bom.',
  );

  return lines.join('\n');
}
