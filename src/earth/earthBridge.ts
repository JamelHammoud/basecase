import { base64ToBytes } from '../utils/base64';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';

export interface EarthAccountState {
  saved: boolean;
}

const call = <T>(channel: string, payload?: unknown) => channelCall<T>(electron()?.earthCall, channel, payload);

const asAccount = (value: unknown): EarthAccountState => ({ saved: !!(value as Partial<EarthAccountState>)?.saved });

export const earthBridge = {
  account: async () => asAccount(await call('earth:account')),
  setKey: async (key: string) => asAccount(await call('earth:set-key', key)),
  tile: async (path: string): Promise<Uint8Array> => {
    const { data } = await call<{ data: Uint8Array | string }>('earth:tile', path);

    return typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(data);
  },
};
