import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';

export interface TrainingComputer {
  host: string;
  user: string;
  key: string;
  hostKey: string;
}

export interface TrainingComputerStatus {
  selected: boolean;
  host?: string;
  user?: string;
  keySaved?: boolean;
  hostKey?: string;
}

const call = <T>(channel: string, payload?: unknown) =>
  channelCall<T>(electron()?.remoteTrainingCall, channel, payload);

const publicStatus = (value: unknown): TrainingComputerStatus => {
  const status = value as Partial<TrainingComputerStatus> | null;

  return {
    selected: status?.selected === true,
    ...(typeof status?.host === 'string' ? { host: status.host } : {}),
    ...(typeof status?.user === 'string' ? { user: status.user } : {}),
    ...(typeof status?.hostKey === 'string' ? { hostKey: status.hostKey } : {}),
    ...(status?.keySaved === true ? { keySaved: true } : {}),
  };
};

export const remoteTrainingBridge = {
  status: async () => publicStatus(await call('remote-training:status')),
  configure: async (computer: TrainingComputer) => publicStatus(await call('remote-training:configure', computer)),
  clear: async () => publicStatus(await call('remote-training:clear')),
};
