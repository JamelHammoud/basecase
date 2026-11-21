import * as THREE from 'three';
import { f } from './mjcfText';

interface ActuatorSpecXml {
  name: string;
  effort: number;
  revolute: boolean;
  range: [number, number] | null;
  wheel: boolean;
}

const WHEEL_FULL_TORQUE_SPEED = 2;

export function actuatorXml(spec: ActuatorSpecXml): string {
  const { name, effort, revolute, range, wheel } = spec;
  const toUnit = (v: number) => (revolute ? THREE.MathUtils.degToRad(v) : v / 1000);
  const force = `forcerange="${f(-effort)} ${f(effort)}"`;

  if (wheel)
    return `    <velocity name="${name}" joint="${name}" kv="${f(effort / WHEEL_FULL_TORQUE_SPEED)}" ${force}/>`;

  const kp = effort / (revolute ? 0.17 : 0.005);
  const ctrl = range ? ` ctrlrange="${f(toUnit(range[0]))} ${f(toUnit(range[1]))}"` : '';

  return `    <position name="${name}" joint="${name}" kp="${f(kp)}" dampratio="1" ${force}${ctrl}/>`;
}

export function estimatedJointAttrs(effort: number, revolute: boolean): string {
  const armature = revolute ? Math.max(0.002, effort * 0.004) : 0.05;

  return `damping="${f(effort * 0.02)}" armature="${f(armature)}" frictionloss="${f(effort * 0.01)}"`;
}
