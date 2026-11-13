const MESSAGE_KEYS = ['buttons', 'pad', 'tilt'];
const RATE_WINDOW_MS = 1000;
const NAME_LIMIT = 40;

export const MAX_MESSAGES_PER_SECOND = 60;

const isPlainObject = (value) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (value) => {
  const keys = Object.keys(value).sort();

  return keys.length === MESSAGE_KEYS.length && keys.every((key, i) => key === MESSAGE_KEYS[i]);
};

const inRange = (value, limit) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

const isPair = (value) => Array.isArray(value) && value.length === 2;

function checkedTilt(tilt) {
  if (!isPair(tilt) || !inRange(tilt[0], 180) || !inRange(tilt[1], 90)) return null;

  return [tilt[0], tilt[1]];
}

function checkedPad(pad) {
  if (pad === null) return { value: null };

  if (!isPair(pad) || !inRange(pad[0], 1) || !inRange(pad[1], 1)) return null;

  return { value: [pad[0], pad[1]] };
}

function checkedButtons(buttons) {
  if (!isPair(buttons) || typeof buttons[0] !== 'boolean' || typeof buttons[1] !== 'boolean') return null;

  return [buttons[0], buttons[1]];
}

function parsed(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function checkedPhoneMessage(text) {
  const value = typeof text === 'string' ? parsed(text) : undefined;

  if (!isPlainObject(value) || !hasExactKeys(value)) return null;

  const tilt = checkedTilt(value.tilt);
  const pad = checkedPad(value.pad);
  const buttons = checkedButtons(value.buttons);

  if (!tilt || !pad || !buttons) return null;

  return { tilt, pad: pad.value, buttons };
}

export class RateCap {
  #limit;
  #window;
  #accepted = [];

  constructor({ limit = MAX_MESSAGES_PER_SECOND, windowMs = RATE_WINDOW_MS } = {}) {
    this.#limit = limit;
    this.#window = windowMs;
  }

  allow(now = Date.now()) {
    while (this.#accepted.length > 0 && now - this.#accepted[0] >= this.#window) this.#accepted.shift();

    if (this.#accepted.length >= this.#limit) return false;

    this.#accepted.push(now);

    return true;
  }
}

function androidModel(userAgent) {
  const inside = /\(([^)]*)\)/.exec(userAgent)?.[1] ?? '';
  const fields = inside.split(';').map((field) => field.trim());
  const at = fields.findIndex((field) => field.startsWith('Android'));
  const model = at >= 0 ? (fields[at + 1] ?? '').split(' Build/')[0] : '';

  return model === 'K' ? '' : model;
}

function cleanName(raw) {
  return raw
    .replace(/[^A-Za-z0-9 _.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_LIMIT)
    .trim();
}

export function deviceName(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 512) : '';

  if (ua.includes('iPhone')) return 'iPhone';

  if (ua.includes('iPad')) return 'iPad';

  return cleanName(androidModel(ua)) || 'Phone';
}
