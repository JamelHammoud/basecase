import { BUNDLED_RATES, CURRENCY_NAMES, type ExchangeRates } from '../data/exchangeRates';
import type { EnteredPrice } from '../types/robotics';

export const DEFAULT_CURRENCY = 'USD';

export interface Money {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  digits: number;
  ratesDate: string;
  fromUsd: (usd: number) => number;
  toUsd: (amount: number) => number;
  amountOf: (usd: number, entered?: EnteredPrice) => number;
  format: (usd: number, entered?: EnteredPrice) => string;
  whole: (usd: number, entered?: EnteredPrice) => string;
  formatAmount: (amount: number) => string;
  plain: (usd: number, entered?: EnteredPrice) => string;
  enter: (amount: number) => { usd: number; entered?: EnteredPrice };
}

export const isCurrency = (code: unknown): code is string => typeof code === 'string' && code in CURRENCY_NAMES;

export const CURRENCY_CODES = Object.keys(CURRENCY_NAMES);

export const scaledEntry = (entered: EnteredPrice | undefined, n: number): EnteredPrice | undefined =>
  entered && { ...entered, amount: entered.amount * n };

const roundUsd = (usd: number) => Math.round(usd * 10000) / 10000;

function symbolOf(fmt: Intl.NumberFormat): string {
  return (
    fmt
      .formatToParts(0)
      .find((p) => p.type === 'currency')
      ?.value.trim() ?? ''
  );
}

export function createMoney(code: string = DEFAULT_CURRENCY, rates: ExchangeRates = BUNDLED_RATES): Money {
  const known = isCurrency(code) && rates.perUsd[code] ? code : DEFAULT_CURRENCY;
  const rate = rates.perUsd[known] ?? 1;
  const exact = new Intl.NumberFormat('en-US', { style: 'currency', currency: known });
  const rounded = new Intl.NumberFormat('en-US', { style: 'currency', currency: known, maximumFractionDigits: 0 });
  const digits = exact.resolvedOptions().maximumFractionDigits ?? 2;
  const fromUsd = (usd: number) => usd * rate;
  const amountOf = (usd: number, entered?: EnteredPrice) =>
    entered?.currency === known ? entered.amount : fromUsd(usd);

  return {
    code: known,
    name: CURRENCY_NAMES[known],
    symbol: symbolOf(exact),
    rate,
    digits,
    ratesDate: rates.date,
    fromUsd,
    toUsd: (amount) => amount / rate,
    amountOf,
    format: (usd, entered) => exact.format(amountOf(usd, entered)),
    whole: (usd, entered) => rounded.format(amountOf(usd, entered)),
    formatAmount: (amount) => exact.format(amount),
    plain: (usd, entered) => amountOf(usd, entered).toFixed(digits),
    enter: (amount) =>
      known === DEFAULT_CURRENCY
        ? { usd: amount }
        : { usd: roundUsd(amount / rate), entered: { amount, currency: known } },
  };
}

export const USD_MONEY = createMoney();

export function currencyNote(money: Money): string[] {
  return money.code === 'USD'
    ? []
    : [
        `Prices are in ${money.code}, the user's currency (US dollar prices converted at ${money.ratesDate} rates). Quote them in ${money.code}.`,
      ];
}
