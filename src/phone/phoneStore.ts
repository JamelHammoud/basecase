import { pressedButtons, type PhoneButton, type PhoneReading } from './phoneDrive';
import type { PairReply, PhoneEvent, PhoneLinkApi } from './phoneTypes';

export const STALE_MS = 500;

export type PhoneState =
  | { status: 'off' }
  | { status: 'pairing'; url: string; token: string; cert: string }
  | { status: 'connected'; name: string };

const OFF: PhoneState = { status: 'off' };

let state: PhoneState = OFF;
let link: PhoneLinkApi | null = null;
let stopEvents: (() => void) | null = null;
let latest: { reading: PhoneReading; at: number } | null = null;
const listeners = new Set<() => void>();
const pressListeners = new Set<(button: PhoneButton) => void>();

function set(next: PhoneState) {
  state = next;

  for (const listener of listeners) listener();
}

function closed() {
  stopEvents?.();
  stopEvents = null;
  latest = null;
  set(OFF);
}

function onInput(reading: PhoneReading) {
  const before = latest?.reading.buttons ?? null;

  latest = { reading, at: performance.now() };

  for (const button of pressedButtons(before, reading.buttons)) for (const listener of pressListeners) listener(button);
}

function readInput({ tilt, pad, buttons }: PhoneReading) {
  if (state.status === 'connected') onInput({ tilt, pad, buttons });
}

function receive(event: PhoneEvent) {
  if (event.type === 'phone-input') return void readInput(event);

  if (event.state === 'connected') set({ status: 'connected', name: event.name });
  else closed();
}

export const phoneSnapshot = () => state;

export function subscribePhone(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function onPhonePress(listener: (button: PhoneButton) => void) {
  pressListeners.add(listener);

  return () => {
    pressListeners.delete(listener);
  };
}

export function phoneReading(now = performance.now()): PhoneReading | null {
  if (state.status !== 'connected' || !latest || now - latest.at > STALE_MS) return null;

  return latest.reading;
}

export function setPhoneLink(next: PhoneLinkApi | null) {
  link = next;
}

export const canPairPhone = () => !!link;

export async function pairPhone(): Promise<PairReply | null> {
  if (!link) return null;

  stopEvents?.();
  stopEvents = link.onPhoneEvent(receive);

  const reply = await link.phonePair();

  if (reply.ok) set({ status: 'pairing', url: reply.url, token: reply.token, cert: reply.cert });
  else closed();

  return reply;
}

export async function unpairPhone() {
  if (state.status === 'off') return;

  await link?.phoneUnpair();
  closed();
}
