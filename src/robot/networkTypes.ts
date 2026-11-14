import type { ConnectSpec, RobotFamily } from './robotState';

export interface NetworkRobot {
  id?: string;
  name: string;
  host: string;
  port: number;
  family?: RobotFamily;
}

export interface NetworkRobotAsk {
  id?: string;
  host: string;
  port?: number;
  code?: string;
}

export interface RobotComputerAsk {
  host: string;
  user: string;
  key: string;
}

export interface RobotInstallAsk {
  target: string;
  jointMap: Record<string, unknown>;
  emulated: true;
  spec: ConnectSpec;
  key?: string;
  port?: number;
  pairingCode?: string;
}

export type RobotInstallReply =
  | { ok: true; host: string; address: string; pairingCode: string | null; port: number; paired?: boolean }
  | { ok: false; message: string };
