import type { ConvertedFiles, ConvertedModel } from '../utils/robotImport/simready';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';

export interface OnshapeAccountState {
  access: boolean;
  secret: boolean;
  name: string | null;
  error: string | null;
}

export type OnshapeKey = 'access' | 'secret';

export interface OnshapeImport {
  model: ConvertedModel;
  files: ConvertedFiles;
}

const call = <T>(channel: string, payload?: unknown) => channelCall<T>(electron()?.onshapeCall, channel, payload);

function asAccount(value: unknown): OnshapeAccountState {
  const v = (value ?? {}) as Partial<OnshapeAccountState>;

  return {
    access: !!v.access,
    secret: !!v.secret,
    name: typeof v.name === 'string' ? v.name : null,
    error: typeof v.error === 'string' ? v.error : null,
  };
}

export const onshapeBridge = {
  account: async () => asAccount(await call('onshape:account')),
  setKey: async (kind: OnshapeKey, value: string) => asAccount(await call('onshape:set-key', { kind, value })),
  importAssembly: (link: string, requestId: string) => call<OnshapeImport>('onshape:import', { link, requestId }),
};
