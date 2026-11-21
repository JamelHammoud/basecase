interface UnitCommandEvent {
  unit: string;
  command: Record<string, unknown>;
  owner?: symbol;
}

const listeners = new Set<(event: UnitCommandEvent) => void>();

export function noteUnitCommand(event: UnitCommandEvent) {
  for (const listener of listeners) listener(event);
}

export function subscribeUnitCommands(listener: (event: UnitCommandEvent) => void) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}
