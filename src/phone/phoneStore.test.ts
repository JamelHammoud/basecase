import { afterEach, describe, expect, it } from 'vitest';
import { pairPhone, phoneReading, phoneSnapshot, setPhoneLink } from './phoneStore';
import type { PairReply, PhoneEvent, PhoneLinkApi, PhoneState } from './phoneTypes';

const PAIRED = { url: 'https://192.168.1.20:5000/?t=new', token: 'new', cert: 'cert' };
const INPUT: PhoneEvent = { type: 'phone-input', tilt: [-20, 0], pad: null, buttons: [false, false] };

function fakeMain(held: PhoneState = { status: 'off' }) {
  const subscribers = new Set<(event: PhoneEvent) => void>();
  let running = held.status !== 'off';
  const emit = (event: PhoneEvent) => subscribers.forEach((s) => s(event));

  const link: PhoneLinkApi = {
    phonePair: async (): Promise<PairReply> => {
      if (running) emit({ type: 'phone', state: 'closed' });

      running = true;

      return { ok: true, ...PAIRED };
    },
    phoneUnpair: async () => ({ ok: true }),
    phoneState: async () => held,
    onPhoneEvent: (callback) => {
      subscribers.add(callback);

      return () => subscribers.delete(callback);
    },
  };

  return { link, emit, subscribers };
}

afterEach(() => setPhoneLink(null));

describe('phoneStore', () => {
  it('keeps listening when pairing ends a run the main process still held', async () => {
    const main = fakeMain();

    setPhoneLink(main.link);
    await pairPhone();
    await pairPhone();
    expect(phoneSnapshot()).toEqual({ status: 'pairing', ...PAIRED });
    expect(main.subscribers.size).toBe(1);

    main.emit({ type: 'phone', state: 'connected', name: 'iPhone' });
    main.emit(INPUT);
    expect(phoneSnapshot()).toEqual({ status: 'connected', name: 'iPhone' });
    expect(phoneReading()?.tilt).toEqual([-20, 0]);
  });

  it('adopts a pairing the main process kept across a reload, and pairs again from it', async () => {
    const held: PhoneState = { status: 'pairing', url: 'https://192.168.1.20:5000/?t=old', token: 'old', cert: 'c' };
    const main = fakeMain(held);

    setPhoneLink(main.link);
    await expect.poll(() => phoneSnapshot()).toEqual(held);
    await pairPhone();
    expect(phoneSnapshot()).toEqual({ status: 'pairing', ...PAIRED });

    main.emit({ type: 'phone', state: 'connected', name: 'Pixel' });
    expect(phoneSnapshot()).toEqual({ status: 'connected', name: 'Pixel' });
  });

  it('adopts a connected phone and drops it when the main process closes it', async () => {
    const main = fakeMain({ status: 'connected', name: 'iPhone' });

    setPhoneLink(main.link);
    await expect.poll(() => phoneSnapshot().status).toBe('connected');
    main.emit({ type: 'phone', state: 'closed' });
    expect(phoneSnapshot()).toEqual({ status: 'off' });
    expect(main.subscribers.size).toBe(0);
  });
});
