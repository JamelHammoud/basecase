import type { ConvertedFiles, ConvertedModel } from '../utils/robotImport/simready';
import { electron, post } from '../utils/platform/transport';

export interface OnshapeAccountState {
  access: boolean;
  secret: boolean;
  name: string | null;
}

export type OnshapeKey = 'access' | 'secret';

export interface OnshapeImport {
  model: ConvertedModel;
  files: ConvertedFiles;
}

const errorText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e))
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '');

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const api = electron();

  try {
    if (api?.onshapeCall) return (await api.onshapeCall(channel, payload)) as T;

    const res = await post<T & { error?: string }>(`/${channel.replace(':', '-')}`, { arg: payload });

    if (res && typeof res === 'object' && 'error' in res && res.error) throw new Error(res.error);

    return res;
  } catch (e) {
    throw new Error(errorText(e), { cause: e });
  }
}

function asAccount(value: unknown): OnshapeAccountState {
  const v = (value ?? {}) as Partial<OnshapeAccountState>;

  return { access: !!v.access, secret: !!v.secret, name: typeof v.name === 'string' ? v.name : null };
}

export const onshapeBridge = {
  account: async () => asAccount(await call('onshape:account')),
  setKey: async (kind: OnshapeKey, value: string) => asAccount(await call('onshape:set-key', { kind, value })),
  importAssembly: (link: string, requestId: string) => call<OnshapeImport>('onshape:import', { link, requestId }),
};
