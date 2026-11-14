import type { ZUpVec } from '../types/skeleton';
import { r1 } from '../agent/agentFrame';
import { prettyJointName } from '../utils/jointNames';
import { MAX_TARGETS, type ArmRequest, type ArmSizing, type ArmTarget, type SizedArm } from '../utils/armSizing';
import { placeArm, type ArmScene } from './armBuild';
import { plural } from '../../electron/plural.mjs';

export interface ArmToolContext extends ArmScene {
  solve: (request: ArmRequest) => Promise<ArmSizing>;
}

export interface ArmPayload {
  targets?: unknown;
  payload_g?: unknown;
  base?: unknown;
}

const isVec = (v: unknown): v is ZUpVec => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

function readTargets(raw: unknown): ArmTarget[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_TARGETS) return null;

  const targets = raw.map((t: { name?: unknown; at?: unknown }, i) =>
    isVec(t?.at)
      ? { id: `target-${i + 1}`, name: typeof t.name === 'string' && t.name ? t.name : `Target ${i + 1}`, at: t.at }
      : null,
  );

  return targets.every((t) => t !== null) ? targets : null;
}

const mm = (v: number[]) => `[${v.map((x) => r1(x) + 0).join(', ')}]`;
const usd = (v: number) => `$${v.toFixed(2)}`;

function armText(arm: SizedArm, targets: ArmTarget[], payloadG: number, links: boolean): string {
  const { shape, servos } = arm;
  const joints = arm.skeleton.joints;
  const placed = links
    ? 'its skeleton, one servo per joint and the arm_template links'
    : 'its skeleton and one servo per joint';

  return [
    `Placed the shortest arm on the 5 mm grid that reaches ${plural(targets.length, 'target')} carrying ${payloadG} g: ${placed}.`,
    `Base at ${mm(shape.base)} turned ${shape.yaw}°${shape.baseHeight ? ` on a ${shape.baseHeight} mm riser` : ''}; links ${shape.links.join(', ')} mm (shoulder bracket, upper arm, forearm).`,
    `Servos at ${r1(servos.volts)} V from ${servos.rail}: ${joints.map((j, i) => `${prettyJointName(j.name ?? j.id)} ${servos.names[i]}`).join('; ')}. Servos ${usd(servos.servosUsd)}, ${usd(servos.costUsd)} with the battery, regulator and bus adapter.`,
    `Reach: ${arm.reach.map((r) => `${targets.find((t) => t.id === r.id)!.name} within ${r1(r.errorMm)} mm`).join(', ')}, with every joint at least 10% inside its range.`,
    'Joint ids match define_skeleton; declare them with define_joints, then run size_actuators on the scene.',
  ].join('\n');
}

export async function sizeArmRequest(payload: ArmPayload, ctx: ArmToolContext): Promise<{ text: string }> {
  const targets = readTargets(payload.targets);
  const payloadG = Number(payload.payload_g);

  if (!targets) return { text: `Give 1 to ${MAX_TARGETS} targets, each with at: [x, y, z] in mm.` };

  if (!Number.isFinite(payloadG) || payloadG < 0) return { text: 'Give payload_g: the grams the wrist carries.' };

  const base = isVec(payload.base) ? payload.base : undefined;
  const result = await ctx.solve({ targets, payloadG, ...(base ? { base } : {}) });

  if (!('arm' in result)) return { text: `No arm: ${result.problem}` };

  placeArm(result.arm, ctx);

  return { text: armText(result.arm, targets, payloadG, ctx.links) };
}
