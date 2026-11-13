import type { CaseControl } from './schema';

export const ROLL: CaseControl[] = [
  { id: 'move', label: 'Move', input: 'move' },
  { id: 'turn', label: 'Turn', input: 'turn' },
];

export const REACH: CaseControl[] = [
  { id: 'move', label: 'Move', input: 'move' },
  { id: 'lift', label: 'Raise and Lower', input: 'lift' },
];

export const REACH_AND_GRIP: CaseControl[] = [...REACH, { id: 'grip', label: 'Grip', input: 'grip' }];
