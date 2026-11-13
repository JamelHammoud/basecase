import { electron, get, post, quietly } from '../utils/platform/transport';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { PairReply, PhoneEvent, PhoneLinkApi, PhoneState } from './phoneTypes';

export type { PairReply, PhoneEvent, PhoneLinkApi } from './phoneTypes';

const OFF: PhoneState = { status: 'off' };

const bridgeLink: PhoneLinkApi = {
  phonePair: () => post<PairReply>('/phone-pair', {}),
  phoneUnpair: () => post<{ ok: boolean }>('/phone-unpair', {}),
  phoneState: () => quietly(() => get<PhoneState>('/phone-state'), OFF),
  onPhoneEvent: (callback) => {
    const events = new EventSource('/api/bridge/phone-events');

    events.onmessage = (e) => quietly(async () => callback(JSON.parse(e.data) as PhoneEvent), undefined);

    return () => events.close();
  },
};

export function platformPhoneLink(): PhoneLinkApi | null {
  const api = electron();

  if (api?.phonePair && api.phoneUnpair && api.phoneState && api.onPhoneEvent)
    return {
      phonePair: api.phonePair,
      phoneUnpair: api.phoneUnpair,
      phoneState: api.phoneState,
      onPhoneEvent: api.onPhoneEvent,
    };

  return IS_WEB_DEMO || api ? null : bridgeLink;
}
