import { DEFAULT_PROJECT } from '../types/robotics';
import type { WiringScene } from './connectors';
import { actuatorOf, COMPONENT_BY_ID } from '../data/components';
import type { ScenePart } from '../types/robotics';
import type { WalkSim } from '../utils/engineeringTypes';

export const electricalWalk = (walk: WalkSim | undefined): WalkSim | undefined =>
  walk ? { policy: walk.policy, seconds: walk.seconds, fellAt: walk.fellAt, joints: {}, power: walk.power } : undefined;

export function isElectricalPart(part: ScenePart) {
  if (part.supplyId) return true;

  if (part.kind !== 'component') return false;

  const component = COMPONENT_BY_ID[part.componentId ?? ''];

  return (
    !component ||
    !['Wheels', 'Grippers'].includes(component.group) ||
    !!actuatorOf(part.componentId!, part.componentVariant)
  );
}

export function electricalSnapshot(scene: WiringScene): WiringScene {
  const electricalParts = scene.parts.filter(isElectricalPart).map((part) => ({
    ...part,
    cad: undefined,
    mesh: undefined,
    sculptMesh: undefined,
    customNodes: undefined,
    deformers: undefined,
    edges: undefined,
  }));
  const { joints, tether, extras, sourced, wiring, electronicsBoard } = scene.project;
  const parts = electronicsBoard ? scene.parts : electricalParts;

  return { parts, project: { ...DEFAULT_PROJECT, joints, tether, extras, sourced, wiring, electronicsBoard } };
}
