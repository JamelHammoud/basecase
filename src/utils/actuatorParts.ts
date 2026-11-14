import { COMPONENT_BY_ID, actuatorOf } from '../data/components';
import type { ScenePart } from '../types/robotics';

export const isServo = (p: ScenePart) =>
  p.kind === 'component' && !!p.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos';

const hasActuator = (p: ScenePart) =>
  p.kind === 'component' && !!p.componentId && !!actuatorOf(p.componentId, p.componentVariant);

export const hasActuatorOrServo = (p: ScenePart) => isServo(p) || hasActuator(p);
