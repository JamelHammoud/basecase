import type { WheelSetup } from './drive';

export function wheelSpeeds(
  wheels: WheelSetup[],
  forwardMmS: number,
  turnRadS: number,
  output: Record<string, number> = Object.create(null),
): Record<string, number> {
  for (const wheel of wheels) {
    output[wheel.joint] = (wheel.spin * (forwardMmS - turnRadS * wheel.lateralMm)) / Math.max(wheel.radiusMm, 1);
  }

  return output;
}
