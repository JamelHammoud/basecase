import type { RobotJoint, ScenePart } from '../types/robotics';
import type { TorqueSeries } from './peakTorque';
import type { AmpModel } from './servoAmps';

export interface MotorCurrentTrace {
  schema: 1;
  method: 'servo-amps-1';
  identity: string;
  windowS: number;
  channels: Array<{
    jointId: string;
    actuatorIds: string[];
    actuators: Array<{ id: string; componentId: string | null; variant: string | null }>;
    model: AmpModel | null;
    amps: number[];
  }>;
}

interface TraceBinding {
  joints: Pick<RobotJoint, 'id' | 'actuators'>[];
  parts: ScenePart[];
  models: Record<string, AmpModel>;
  identity: string;
}

export function retainMotorTrace(series: TorqueSeries, binding: TraceBinding): MotorCurrentTrace {
  const parts = new Map(binding.parts.map((part) => [part.id, part]));

  return {
    schema: 1,
    method: 'servo-amps-1',
    identity: binding.identity,
    windowS: series.windowS,
    channels: binding.joints.flatMap((joint, index) =>
      joint.actuators?.length
        ? [
            {
              jointId: joint.id,
              actuatorIds: [...(joint.actuators ?? [])],
              actuators: (joint.actuators ?? []).map((id) => ({
                id,
                componentId: parts.get(id)?.componentId ?? null,
                variant: parts.get(id)?.componentVariant ?? null,
              })),
              model: binding.models[joint.id] ? { ...binding.models[joint.id] } : null,
              amps: [...(series.amps?.[index] ?? [])],
            },
          ]
        : [],
    ),
  };
}
