import type { RoboflowAccount, RoboflowAccountState, RoboflowArchive } from './index.mjs';

export const ROBOFLOW_CALLS: {
  'roboflow:account': (account: RoboflowAccount) => RoboflowAccountState;
  'roboflow:set-key': (account: RoboflowAccount, key: unknown) => Promise<RoboflowAccountState>;
  'roboflow:import': (account: RoboflowAccount, link: unknown) => Promise<RoboflowArchive>;
};

export function registerRoboflowHandlers(
  ipcMain: { handle(channel: string, handler: (event: unknown, payload: unknown) => unknown): void },
  account: RoboflowAccount,
): void;

export function roboflowPostRoutes(
  account: RoboflowAccount,
): Array<
  [
    '/roboflow-account' | '/roboflow-set-key' | '/roboflow-import',
    (body: { arg?: unknown } | null) => Promise<RoboflowAccountState | { name: string; data: string }>,
  ]
>;
