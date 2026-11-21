import type { MotorCurrentTrace } from '../utils/motorCurrentTrace';
import type { ElectricalInput } from './electricalTypes';

export const POWER_REPLAY_LIMITS = { samples: 4096, segments: 128, loads: 64, retainedBytes: 4 * 1024 * 1024 };
export const POWER_REPLAY_METHOD = 'paired-resistive-tree-1';

export interface ReplaySource {
  volts: number;
  ohms: number;
  evidence: string;
  temperatureC: number;
  maximumA: number;
  minimumV: number;
}

export interface ReplayResistance {
  id: string;
  outgoingOhms: number;
  returnOhms: number;
  temperatureC: number;
  evidence: string;
}

export interface ReplayDeclarations {
  source: ReplaySource;
  junctionEvidence: string;
  cables: ReplayResistance[];
  fixedLoads: Record<string, { amps: number; evidence: string }>;
}

export interface ReplayCable {
  id: string;
  from: string;
  to: string;
  name: string;
  partIds: string[];
  route: unknown;
}

export interface PowerReplayRequest {
  input: ElectricalInput;
  trace: MotorCurrentTrace;
  declarations: ReplayDeclarations;
}

export interface ReplayNetwork {
  method: typeof POWER_REPLAY_METHOD;
  source: ReplaySource;
  sourceId: string;
  windowS: number;
  vertices: string[];
  segments: Array<ReplayCable & ReplayResistance>;
  loads: Array<{ partId: string; jointId: string | null; node: string; amps: number[] }>;
}

export interface PowerReplayResult {
  method: typeof POWER_REPLAY_METHOD;
  status: 'complete' | 'limit';
  windowS: number;
  sourceA: number[];
  sourceLossW: number[];
  lossW: number[];
  endpoints: Array<{ partId: string; jointId: string | null; volts: number[] }>;
  segments: Array<{
    id: string;
    name: string;
    from: string;
    to: string;
    partIds: string[];
    amps: number[];
    lossW: number[];
  }>;
  limiting: { partId: string; sample: number; timeS: number; volts: number };
  limit: { sample: number; reason: 'voltage' | 'current' } | null;
}

export interface PowerReplayRecord extends PowerReplayRequest {
  schema: 1;
  method: typeof POWER_REPLAY_METHOD;
  sourceFingerprint: string;
  traceFingerprint: string;
  declarationFingerprint: string;
  result: PowerReplayResult;
}
