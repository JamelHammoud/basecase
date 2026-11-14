import type { RobotComputerAsk, RobotInstallReply } from './networkTypes';

export type InstallComputer = (ask: RobotComputerAsk) => Promise<RobotInstallReply>;

let install: InstallComputer | null = null;
const listeners = new Set<() => void>();

export const robotComputerSnapshot = () => install;

export function subscribeRobotComputer(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function openRobotComputer(next: InstallComputer | null) {
  install = next;

  for (const listener of listeners) listener();
}
