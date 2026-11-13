import { bytesToBase64 } from '../utils/base64';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';

export interface HubAccountState {
  signedIn: boolean;
  name: string | null;
}

export interface HubPublish {
  kind: 'dataset' | 'model';
  name: string;
  files: Record<string, Uint8Array>;
}

export interface HubPublished {
  repo: string;
  url: string;
}

const forHttp = (payload: unknown) => {
  const job = payload as Partial<HubPublish> | undefined;

  if (!job?.files) return payload;

  return { ...job, files: Object.fromEntries(Object.entries(job.files).map(([p, b]) => [p, bytesToBase64(b)])) };
};

const call = <T>(channel: string, payload?: unknown) => channelCall<T>(electron()?.hubCall, channel, payload, forHttp);

function asAccount(value: unknown): HubAccountState {
  const v = (value ?? {}) as Partial<HubAccountState>;

  return { signedIn: !!v.signedIn, name: typeof v.name === 'string' ? v.name : null };
}

export const hubBridge = {
  account: async () => asAccount(await call('hub:account')),
  signIn: async (token: string) => asAccount(await call('hub:sign-in', token)),
  publish: (payload: HubPublish) => call<HubPublished>('hub:publish', payload),
};
