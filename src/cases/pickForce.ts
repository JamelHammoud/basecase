import type { Formula } from '../skills/contract';
import type { CaseProbe } from './schema';
import { editableConsole, addPanel } from './console/consoleEdits';

export function forcePickProbes(object: string, ceilingN: number): CaseProbe[] {
  if (ceilingN <= 0) return [];

  const target = { from: 'end-effector' as const, to: { object } };

  return [
    { ...target, signal: 'jawForce1', kind: 'grip-force', jaw: 0 },
    { ...target, signal: 'jawForce2', kind: 'grip-force', jaw: 1 },
    { ...target, signal: 'gripForce', kind: 'grip-force' },
    { ...target, signal: 'gripForcePeak', kind: 'grip-force-peak', ceilingN },
  ];
}

export function forceLimitedPick(success: Formula, ceilingN: number): Formula {
  if (ceilingN <= 0) return success;

  return {
    all: [
      success,
      {
        always: {
          window: 'whole',
          state: {
            atom: {
              expr: { signal: 'gripForcePeak' },
              cmp: '<=',
              value: ceilingN,
              scale: ceilingN,
            },
          },
        },
      },
    ],
  };
}

export const forcePickConsole = () =>
  addPanel(editableConsole(undefined), {
    kind: 'plot',
    title: 'Grip force',
    signals: ['probe.jawForce1', 'probe.jawForce2', 'probe.gripForce', 'probe.gripForcePeak'],
  }).console;

export function pickConsoleValue(input: { given: unknown; goal: string; ceilingN: number }) {
  if (input.given !== undefined) return { console: input.given };

  return input.goal === 'pick' && input.ceilingN > 0 ? { console: forcePickConsole() } : {};
}
