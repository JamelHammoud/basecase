import { actuatorOf, COMPONENT_BY_ID } from '../data/components';
import { currentDraw, servoParts, servoRegulator, servoSource } from '../utils/engineeringPower';
import { findPowerSources } from '../utils/powerSources';
import type { ElectricalProjection, ElectricalRequirement } from './electricalTypes';
import type { WalkSim } from '../utils/engineeringTypes';
import type { Tether } from '../types/robotics';

function validTether(tether: Tether | undefined) {
  return (
    !!tether && Number.isFinite(tether.volts) && Number.isFinite(tether.amps) && tether.volts > 0 && tether.amps > 0
  );
}

const requirement = (code: string, detail: string, partIds: string[] = []): ElectricalRequirement => ({
  code,
  detail,
  partIds,
  references: [],
});

function supplyRequirements(projection: ElectricalProjection) {
  const { parts, project } = projection.inputs;
  const scene = { parts, project, servos: servoParts(parts) };
  const sources = findPowerSources(scene);
  const malformed = !sources.length && !!project.tether && !validTether(project.tether);
  const source = malformed ? undefined : servoSource(scene);
  const requirements: ElectricalRequirement[] = [];

  if (!source && projection.endpoints.length)
    requirements.push(
      requirement(
        'missing-source',
        'Declare a power source for the electrical loads.',
        parts.map((part) => part.id),
      ),
    );

  if (sources.length > 1)
    requirements.push(
      requirement('conflicting-supplies', 'Resolve multiple power sources before joining their rails.'),
    );

  if (source && !sources.length && !validTether(project.tether))
    requirements.push(requirement('undeclared-source', 'Confirm the suggested supply voltage and current in Checks.'));

  return { scene, source, requirements };
}

function unknownLoadRequirements(projection: ElectricalProjection) {
  const unknown = projection.inputs.parts.filter((part) => {
    const component = COMPONENT_BY_ID[part.componentId ?? ''];

    return (
      part.kind === 'component' &&
      !actuatorOf(part.componentId!, part.componentVariant) &&
      !component?.battery &&
      !component?.regulator
    );
  });

  return unknown.length
    ? [
        requirement(
          'unknown-load',
          'Specify module supply current and transient requirements.',
          unknown.map((part) => part.id),
        ),
      ]
    : [];
}

function applyRailBudgets(
  projection: ElectricalProjection,
  supply: NonNullable<ReturnType<typeof supplyRequirements>['source']>,
) {
  const { parts, project } = projection.inputs;
  const regulator = servoRegulator({ parts, project, servos: servoParts(parts) });
  const nominal = regulator?.regulator.vout ?? supply.battery.nominalV;
  const maximum = regulator?.regulator.vout ?? supply.battery.fullV;
  const declared =
    regulator?.regulator.ioutA ?? supply.tetherA ?? (supply.battery.capacityAh * supply.battery.cRating || null);

  return { nominal, maximum, declared, regulator };
}

export function electricalBudgets(projection: ElectricalProjection, walk?: WalkSim): ElectricalRequirement[] {
  const { scene, source, requirements } = supplyRequirements(projection);

  requirements.push(...unknownLoadRequirements(projection));

  if (!source) return requirements;

  const { parts, project, servos } = scene;
  const draw = currentDraw(
    { ...scene, joints: project.joints ?? [], input: { parts, project, measures: {}, servoOutputs: {}, walk } },
    source,
  );
  const { nominal, maximum, declared, regulator } = applyRailBudgets(projection, source);

  projection.powerBudget = {
    sourceName: source.name,
    sourceNominalV: source.battery.nominalV,
    sourceMaximumV: source.battery.fullV,
    sourceDeclaredA: source.tetherA ?? (source.battery.capacityAh * source.battery.cRating || null),
    selectedRegulatorId: regulator?.id ?? null,
    proposedServoNominalV: nominal,
    proposedServoMaximumV: maximum,
    proposedServoDeclaredA: declared,
    estimatedSourceAverageA: draw.avg,
    estimatedSourcePeakA: draw.peak,
    estimatedServoPeakA: draw.servoPeak,
    estimateBasis: draw.hungriest ? 'existing-walk-model' : 'existing-standing-model',
    transientA: null,
  };

  const mismatched = servos.filter((part) => {
    const actuator = actuatorOf(part.componentId!, part.componentVariant);

    return actuator && (nominal < actuator.volts[0] || maximum > actuator.volts[1]);
  });

  if (mismatched.length)
    requirements.push(
      requirement(
        'rail-voltage',
        'The derived supply is outside an actuator voltage range.',
        mismatched.map((part) => part.id),
      ),
    );

  const railOverload = declared !== null && draw.servoPeak > declared;
  const sourceOverload = source.tetherA !== undefined && draw.peak > source.tetherA;

  if (railOverload || sourceOverload)
    requirements.push(
      requirement(
        'rail-overload',
        'The estimated peak load exceeds the declared rail current.',
        servos.map((part) => part.id),
      ),
    );

  return requirements;
}
