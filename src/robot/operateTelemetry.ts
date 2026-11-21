import type { RobotEvent } from './robotState';

export function operateTelemetry(event: RobotEvent): Record<string, number> {
  const joints: Array<Record<string, unknown>> = Array.isArray(event.joints) ? event.joints : [];
  const signals: Record<string, number> = {};
  const voltages: number[] = [];

  for (const joint of joints) {
    for (const field of ['volts', 'temp_c', 'velocity', 'effort']) {
      const value = joint[field];

      if (typeof value === 'number' && Number.isFinite(value)) signals[`joint.${joint.id}.${field}`] = value;
    }

    if (typeof joint.volts === 'number' && Number.isFinite(joint.volts)) voltages.push(joint.volts);
  }

  if (voltages.length > 0 && voltages.length === joints.length) signals.volts = Math.min(...voltages);

  return signals;
}
