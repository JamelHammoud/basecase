import type { PhoneReading } from './phoneDrive';

export type PairReply = { ok: true; url: string; token: string; cert: string } | { ok: false; message?: string };

export type PhoneState =
  | { status: 'off' }
  | { status: 'pairing'; url: string; token: string; cert: string }
  | { status: 'connected'; name: string };

export type PhoneEvent =
  | { type: 'phone'; state: 'connected'; name: string }
  | { type: 'phone'; state: 'closed' }
  | ({ type: 'phone-input' } & PhoneReading);

export interface PhoneLinkApi {
  phonePair: () => Promise<PairReply>;
  phoneUnpair: () => Promise<{ ok: boolean }>;
  phoneState: () => Promise<PhoneState>;
  onPhoneEvent: (callback: (event: PhoneEvent) => void) => () => void;
}
