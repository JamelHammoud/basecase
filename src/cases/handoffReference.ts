import { REACH_PER_SECOND } from '../sim/drive';
import { CONTROL_DT } from '../sim/driveTiming';
import type { V3 } from '../utils/kinematics';
import type { BuilderRobot } from './caseGoals';
import type { HandoffLayout } from './handoffLayout';
import type { ReferenceCommand } from './schema';

const OPEN = [0, 0];
const CLOSED = [0, 1];
const SETTLE_S = 0.4;
const GRIP_S = 0.6;
const SLACK = 1.4;
const LOWER_SPEED_SHARE = 0.2;

function lowerCommands(command: ReferenceCommand, from: V3, duration: number): ReferenceCommand[] {
  const count = Math.ceil(duration / CONTROL_DT);

  return Array.from({ length: count + 1 }, (_, i) => {
    const fraction = i / count;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const target = from.map((x, axis) => x + (command.target![axis] - x) * smooth) as V3;

    return { ...command, at: Math.round((command.at + fraction * duration) * 100) / 100, target };
  });
}

export function handoffReference(robot: BuilderRobot, layout: HandoffLayout): ReferenceCommand[] {
  const { donor, recipient, block, spot, gripY, hoverY, gap, size } = layout;
  const pick: V3 = [block[0], gripY, block[2] - gap / 2];
  const place: V3 = [spot[0], gripY, spot[2] + gap / 2];
  const above = (p: V3): V3 => [p[0], hoverY, p[2]];
  const retreat: V3 = [donor[0], donor[1], donor[2] - size[2]];
  const commands: Array<{ slot: 'a' | 'b'; target: V3; aux: number[]; wait?: number; lower?: boolean }> = [
    { slot: 'a', target: above(pick), aux: OPEN },
    { slot: 'a', target: pick, aux: OPEN },
    { slot: 'a', target: pick, aux: CLOSED, wait: GRIP_S },
    { slot: 'a', target: above(pick), aux: CLOSED },
    { slot: 'a', target: donor, aux: CLOSED },
    { slot: 'b', target: above(recipient), aux: OPEN },
    { slot: 'b', target: recipient, aux: OPEN },
    { slot: 'b', target: recipient, aux: CLOSED, wait: GRIP_S },
    { slot: 'a', target: donor, aux: OPEN, wait: GRIP_S },
    { slot: 'a', target: retreat, aux: OPEN },
    { slot: 'b', target: above(place), aux: CLOSED },
    { slot: 'b', target: place, aux: CLOSED, lower: true },
    { slot: 'b', target: place, aux: OPEN, wait: GRIP_S },
    { slot: 'b', target: above(place), aux: OPEN },
  ];
  const partner = robot.partner ?? robot;
  const placedRest = partner.facts.endEffector?.point ?? partner.facts.anchor;
  const restB: V3 = [layout.anchor[0], placedRest[1], layout.anchor[2]];
  const last: Record<string, V3> = { a: robot.facts.endEffector?.point ?? donor, b: restB };
  const speeds = {
    a: Math.max(1, robot.facts.reachMm) * REACH_PER_SECOND,
    b: Math.max(1, partner.facts.reachMm) * REACH_PER_SECOND,
  };
  let at = 0.2;

  return commands.flatMap((c) => {
    const command = { at: Math.round(at * 100) / 100, slot: c.slot, target: c.target, aux: c.aux };
    const from = last[c.slot];
    const distance = Math.hypot(...c.target.map((x, i) => x - from[i]));
    const lowering = distance / (speeds[c.slot] * LOWER_SPEED_SHARE);

    at += c.wait ?? (c.lower ? lowering + SETTLE_S : (distance / speeds[c.slot]) * SLACK + SETTLE_S);
    last[c.slot] = c.target;

    return c.lower ? lowerCommands(command, from, lowering) : [command];
  });
}
