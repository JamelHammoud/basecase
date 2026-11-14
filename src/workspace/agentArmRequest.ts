import type { ZUpVec } from '../types/skeleton';
import { armParts } from '../utils/armParts';
import { ARM_GEOMETRY, type ArmSizing, type SizedArm } from '../utils/armSizing';
import { sizeArmInWorker } from '../utils/armSizingClient';
import { formatMoney as money, formatWhole as whole } from '../utils/currencyStore';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { plural } from '../../electron/plural.mjs';
import type { RequestContext } from './agentRequestHandlers';
import { newId } from './helpers';

type Payload = Record<string, unknown>;

const point = (v: ZUpVec) => `[${v.map((n) => Math.round(n)).join(', ')}]`;

function reachText(result: Exclude<ArmSizing, { ok: true } | { reason: 'load' }>): string {
  const { toolSideMm, yaw } = ARM_GEOMETRY;

  if (result.reason === 'near') return `is within ${toolSideMm} mm of the base axis: move it out from the base`;

  if (result.reason === 'spread')
    return `is past the base yaw range from the other targets: keep every target within ${yaw[1] - yaw[0]}° around the base`;

  return `is out of reach: ${result.distanceMm} mm from the base`;
}

function failureText(result: Exclude<ArmSizing, { ok: true }>, targets: ZUpVec[], payloadG: number): string {
  if (result.reason === 'load')
    return `No servo in the STS3215 case holds the ${result.joint.toLowerCase()} with ${payloadG} g at the wrist. No arm placed.`;

  return `Target ${result.target + 1} ${point(targets[result.target])} ${reachText(result)}. No arm placed.`;
}

function closingHint(links: boolean): string {
  if (links)
    return 'The skeleton is set, the servos are framed on its joints and the printed links are arm_template placeholders: restyle them with model_part, then define_joints and verify_design.';

  return "The skeleton is set and the servos are framed on its joints: build the links with arm_template's servo_link lengths (find_recipes), then define_joints and verify_design.";
}

function armText(arm: SizedArm, links: boolean): string {
  const { shape } = arm;
  const servos = arm.picks.map(
    (p) => `- ${p.name}: ${p.servoName}, ${p.stallShare.toFixed(2)} of stall, ${money(p.usd)}`,
  );
  const errors = arm.errorsMm.map((e, i) => `target ${i + 1} ${e.toFixed(1)} mm`);

  return [
    `Arm for ${plural(arm.errorsMm.length, 'target')} with ${arm.payloadG} g at the wrist flange.`,
    `Links: shoulder bracket ${arm.shoulderMm} mm, upper arm ${shape.upperArm} mm, forearm ${shape.forearm} mm, base riser ${shape.riser} mm.`,
    `Base at ${point(arm.base)}, turned ${arm.heading}° about Z (0° reaches −Y).`,
    'Servos:',
    ...servos,
    `Rail: ${arm.rail} at ${Math.round(arm.volts * 10) / 10} V. Servos ${whole(arm.servosUsd)}, ${whole(arm.costUsd)} with power and bus adapter.`,
    `Reach error: ${errors.join(', ')}.`,
    closingHint(links),
  ].join('\n');
}

export async function sizeArmRequest(payload: Payload, ctx: RequestContext) {
  const targets = (payload.targets as ZUpVec[] | undefined) ?? [];
  const payloadG = Number(payload.payload_g) || 0;
  const base = payload.base as ZUpVec | undefined;

  ctx.setAction('Sizing the arm');

  const result = await sizeArmInWorker({ targets, payloadG, base });

  if (!result.ok) return { text: failureText(result, targets, payloadG), data: { ok: false } };

  const { arm } = result;
  const links = !IS_WEB_DEMO;
  const placed = armParts(arm, { links, prefix: newId('arm') });

  ctx.insertParts(placed.parts, []);
  ctx.setProjectNow({ ...ctx.project(), skeleton: placed.skeleton });

  return {
    text: armText(arm, links),
    data: {
      ok: true,
      upperArm: arm.shape.upperArm,
      forearm: arm.shape.forearm,
      riser: arm.shape.riser,
      heading: arm.heading,
      servos: arm.picks.map((p) => p.servo),
      costUsd: arm.costUsd,
    },
  };
}
