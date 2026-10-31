import { BUNDLED_RATES, RATES_SOURCE, type ExchangeRates } from '../data/exchangeRates';
import type { EnteredPrice } from '../types/robotics';
import { createMoney, DEFAULT_CURRENCY, isCurrency, type Money } from './currency';

const CURRENCY_KEY = 'currency';
const RATES_KEY = 'exchange-rates';

const storage = () => (typeof window === 'undefined' ? undefined : window.localStorage);

function read(key: string): unknown {
  try {
    return JSON.parse(storage()?.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {}
}

function isRates(value: unknown): value is ExchangeRates {
  const r = value as Partial<ExchangeRates> | null;

  return !!r && typeof r.date === 'string' && !!r.perUsd && typeof r.perUsd === 'object';
}

function newerRates(saved: unknown): ExchangeRates {
  return isRates(saved) && saved.date > BUNDLED_RATES.date
    ? { date: saved.date, perUsd: { ...BUNDLED_RATES.perUsd, ...saved.perUsd, USD: 1 } }
    : BUNDLED_RATES;
}

const savedCode = read(CURRENCY_KEY);
let code = isCurrency(savedCode) ? savedCode : DEFAULT_CURRENCY;
let rates = newerRates(read(RATES_KEY));
let current = createMoney(code, rates);
const listeners = new Set<() => void>();

function publish() {
  current = createMoney(code, rates);
  listeners.forEach((l) => l());
}

export const currentMoney = (): Money => current;

export function subscribeMoney(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function setCurrency(next: string) {
  if (!isCurrency(next) || next === code) return;

  code = next;
  write(CURRENCY_KEY, next);
  publish();
}

export async function refreshRates(fetcher: typeof fetch = fetch, now = new Date()) {
  if (rates.date >= now.toISOString().slice(0, 10)) return;

  try {
    const res = await fetcher(RATES_SOURCE);

    if (!res.ok) return;

    const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
    const next = newerRates({ date: body.date, perUsd: body.rates });

    if (next === BUNDLED_RATES || next.date <= rates.date) return;

    rates = next;
    write(RATES_KEY, next);
    publish();
  } catch {}
}

export const formatMoney = (usd: number, entered?: EnteredPrice) => current.format(usd, entered);

export const formatWhole = (usd: number, entered?: EnteredPrice) => current.whole(usd, entered);
