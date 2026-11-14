import type { JointServoFit, MjcfInput, ServoSpread } from '../sim/mjcfTypes';
import { spreadReach } from '../skills/servoDraws';
import { calibrationApplies } from './measuredJoints';
import { populationFit, populationFor, populationKey, servoSpread, type ServoPopulation } from './population';
import { presetServo } from './servoEstimate';
import { jointServo } from './servoPart';
import type { ServoCalibration } from './types';

interface Drawn {
  joint: string;
  population: ServoPopulation;
  fit: JointServoFit;
}

function drawnJoints(input: MjcfInput, skip: Set<string>, populations: readonly ServoPopulation[]): Drawn[] {
  return (input.project.joints ?? []).flatMap((j) => {
    const servo = j.type === 'revolute' && !skip.has(j.id) ? jointServo(j, input.parts) : null;
    const preset = servo ? presetServo(servo) : null;
    const population = servo && preset ? populationFor(populations, servo, preset.volts) : null;

    if (!preset || !population) return [];

    const fit = populationFit(population, preset.fit);
    const reach = spreadReach(servoSpread(population, [j.id]), 'delayS');

    return [{ joint: j.id, population, fit: { fit, volts: population.volts, historyS: fit.delayS * reach } }];
  });
}

function spreadsOf(drawn: Drawn[]): ServoSpread[] {
  const groups = new Map<string, Drawn[]>();

  for (const d of drawn) {
    const key = populationKey(d.population.servo, d.population.volts);

    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  return [...groups.values()].map((group) =>
    servoSpread(
      group[0].population,
      group.map((d) => d.joint),
    ),
  );
}

export function calibratedInput(
  input: MjcfInput,
  calibrations: Record<string, ServoCalibration>,
  populations: readonly ServoPopulation[] = [],
): MjcfInput {
  const applied = Object.entries(calibrations).filter(([jointId, c]) =>
    calibrationApplies(
      c,
      input.project.joints?.find((j) => j.id === jointId),
      input.parts,
    ),
  );
  const skip = new Set([...applied.map(([id]) => id), ...Object.keys(input.servoFits ?? {})]);
  const drawn = drawnJoints(input, skip, populations);

  if (!applied.length && !drawn.length) return input;

  return {
    ...input,
    servoFits: {
      ...input.servoFits,
      ...Object.fromEntries(drawn.map((d) => [d.joint, d.fit])),
      ...Object.fromEntries(applied.map(([id, c]) => [id, { fit: c.fit, volts: c.volts }])),
    },
    ...(drawn.length ? { servoSpreads: [...(input.servoSpreads ?? []), ...spreadsOf(drawn)] } : {}),
  };
}
