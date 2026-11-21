import { CONTROL_DT } from '../sim/driveTiming';
import type { V3 } from '../utils/kinematics';
import type { ReferenceCommand } from './schema';

export function lowerCommands(command: ReferenceCommand, from: V3, duration: number): ReferenceCommand[] {
  const count = Math.ceil(duration / CONTROL_DT);

  return Array.from({ length: count + 1 }, (_, i) => {
    const fraction = i / count;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const target = from.map((x, axis) => x + (command.target![axis] - x) * smooth) as V3;

    return { ...command, at: Math.round((command.at + fraction * duration) * 100) / 100, target };
  });
}
