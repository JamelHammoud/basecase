import { findNode, SENSOR_FACTS } from './nodes';
import type { Capability, Routine } from './schema';
import { allSteps } from './schema';

const MOVERS: readonly Capability[] = ['legs', 'wheels', 'arms'];

export function moverFor(capabilities: readonly Capability[]): Capability {
  return MOVERS.find((m) => capabilities.includes(m)) ?? 'legs';
}

function modelNeeds(modelId: string): Capability[] {
  const inputs = findNode(modelId)?.inputs ?? [];

  return [
    ...(inputs.includes('image') ? ['camera' as const] : []),
    ...(inputs.includes('audio') ? ['microphone' as const] : []),
  ];
}

function inputNeeds(input: string | undefined): Capability[] {
  const sensor = input === undefined ? undefined : SENSOR_FACTS[input];

  return sensor ? [sensor.capability as Capability] : [];
}

function stepNeeds(routine: Routine): Capability[] {
  return allSteps(routine).flatMap((step): Capability[] => {
    if (step.kind === 'say') return ['speaker'];

    if (step.kind === 'infer' || step.kind === 'ask') return inputNeeds(step.input);

    return step.kind === 'do' && step.holds.includes('head') ? ['head'] : [];
  });
}

export function routineNeeds(routine: Routine, capabilities: readonly Capability[]): Capability[] {
  const moves = allSteps(routine).some((s) => s.kind === 'do' && s.holds.includes('body'));
  const hasMover = routine.requires.some((r) => MOVERS.includes(r));
  const mover: Capability[] = moves && !hasMover ? [moverFor(capabilities)] : [];

  return [...mover, ...stepNeeds(routine), ...routine.watchers.flatMap((w) => modelNeeds(w.model))];
}

export function withNeeds(routine: Routine, capabilities: readonly Capability[]): Routine {
  const missing = [...new Set(routineNeeds(routine, capabilities))].filter((c) => !routine.requires.includes(c));

  return missing.length ? { ...routine, requires: [...routine.requires, ...missing] } : routine;
}
