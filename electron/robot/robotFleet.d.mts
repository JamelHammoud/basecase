import type { RobotRun } from '../../src/robot/runBuffer';
import type { NetworkRobot, NetworkRobotAsk } from '../../src/robot/networkTypes';
import type { RobotPolicyRef } from '../../src/robot/robotPolicy';
import type {
  ConnectReply,
  ConnectSpec,
  RobotEvent,
  RobotMount,
  RobotSample,
  RobotStatus,
  RobotUnitState,
} from '../../src/robot/robotState';

interface FleetOptions {
  binary: string;
  emit: (event: RobotEvent) => void;
  tmpDir?: string;
  networkStoreDir?: string;
}

interface FleetEntry {
  link: { session: { pipe: { kill: () => void } } | null };
}

export class RobotFleet {
  constructor(options: FleetOptions);
  connect(spec: ConnectSpec, unit?: string): ConnectReply;
  connectNetwork(ask: NetworkRobotAsk, unit?: string): Promise<ConnectReply>;
  discover(): Promise<NetworkRobot[]>;
  command(command: Record<string, unknown>, unit?: string): ConnectReply;
  calibrate(joints: RobotMount[], unit?: string): ConnectReply;
  readRun(unit?: string): RobotRun | null;
  record(sample: RobotSample, unit?: string): ConnectReply;
  disconnect(unit?: string): ConnectReply;
  policy(refs: RobotPolicyRef[], unit?: string): ConnectReply;
  state(unit?: string): RobotUnitState & { status: (RobotEvent & RobotStatus) | null };
  units(): RobotUnitState[];
  entryOf(unit?: string): FleetEntry | undefined;
  dispose(): void;
}

export function unitSeed(unit: string): number | null;
