import { actuatorOf, type ActuatorSpec } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { RATED_OF_STALL } from './actuatorRules';
import type { ActuatorOption } from './actuatorCatalog';
import { servoUp } from './actuatorSizing';
import { jointLabel } from './engineeringFormat';
import type { JointEnvelope, JointLoad, ServoCurve, WalkJoint } from './engineeringTypes';
import { outsideEnvelope, servoCurve } from './peakTorque';

export interface NamedServo {
  name: string;
  act: ActuatorSpec;
}

export type ServoLookup = (joint: RobotJoint) => NamedServo | undefined;

export function servoLookup(byPart: Map<string, ScenePart>): ServoLookup {
  return (joint) =>
    (joint.actuators ?? []).flatMap((id) => {
      const part = byPart.get(id);
      const act = part?.componentId ? actuatorOf(part.componentId, part.componentVariant) : undefined;

      return part && act ? [{ name: part.name, act }] : [];
    })[0];
}

export function loadCurve(load: JointLoad): ServoCurve | undefined {
  if (!load.stallNm || !load.noLoadRpm) return undefined;

  return { stallNm: load.stallNm, ratedNm: load.ratedNm ?? RATED_OF_STALL * load.stallNm, rpm: load.noLoadRpm };
}

export const outsideShare = (load: JointLoad, walk: WalkJoint) => {
  const curve = loadCurve(load);

  return curve && walk.samples?.length ? outsideEnvelope(walk.samples, curve) : 0;
};

function upCurve(load: JointLoad, servo: NamedServo, options: ActuatorOption[]) {
  const volts = load.volts ?? servo.act.atVolts;
  const option = servoUp(servo.act, volts, options);
  const curve = option && servoCurve(option.act, volts, Math.max(1, load.joint.actuators?.length ?? 0));

  return option && curve ? { ...curve, name: option.name } : undefined;
}

export function jointEnvelope(
  load: JointLoad,
  walk: WalkJoint,
  ctx: { servo?: NamedServo; options: () => ActuatorOption[] },
): JointEnvelope | undefined {
  const curve = loadCurve(load);

  if (!curve || !walk.samples?.length || !ctx.servo) return undefined;

  const up = upCurve(load, ctx.servo, ctx.options());

  return {
    joint: load.joint.id,
    label: jointLabel(load.joint),
    samples: walk.samples,
    servo: { ...curve, name: ctx.servo.name },
    ...(up ? { up } : {}),
    outside: outsideEnvelope(walk.samples, curve),
  };
}
