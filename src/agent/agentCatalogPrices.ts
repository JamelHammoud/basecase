import type { ActuatorSpec } from '../data/components';
import { LIST_PRICES, listPriceFor } from '../data/listPrices';
import type { Purchases } from '../types/robotics';
import { checkedPrice, onHandOf } from '../utils/onHand';
import { holdVerdict, ratingAt, stanceVerdict } from '../utils/actuatorRules';
import { currentMoney, formatMoney, formatWhole } from '../utils/currencyStore';
import { angle } from '../utils/angle';

export interface CatalogNeed {
  nm: number;
  joint: string;
}

export interface CatalogContext {
  purchases: Purchases;
  used?: Record<string, number>;
  budget?: { budgetUsd: number; estimatedUsd: number };
  stance?: CatalogNeed & { crouchDeg?: number };
  hold?: CatalogNeed;
  volts?: number;
}

const per = (n: number) => (n > 1 ? ` per ${n}` : '');

const usedOf = (key: string, ctx?: CatalogContext) => ctx?.used?.[key] ?? 0;

export const ownedKeys = (ctx?: CatalogContext) =>
  Object.keys(ctx?.purchases ?? {}).filter((key) => onHandOf(ctx?.purchases[key]) > 0);

function stockText(key: string, ctx?: CatalogContext): string {
  const onHand = onHandOf(ctx?.purchases[key]);

  if (!onHand) return '';

  const used = usedOf(key, ctx);
  const rest = onHand >= used ? `${onHand - used} left` : `${used - onHand} to buy`;

  return `${onHand} on hand, ${used} in this scene, ${rest}`;
}

export function unitPrice(key: string, ctx?: CatalogContext): number | undefined {
  const checked = checkedPrice(ctx?.purchases[key]);

  if (checked) return checked.priceUsd / checked.packQty;

  const list = listPriceFor(key);

  return list && list.usd / list.per;
}

function listedPrice(key: string, ctx?: CatalogContext): string {
  const checked = checkedPrice(ctx?.purchases[key]);

  if (checked)
    return `${formatMoney(checked.priceUsd, checked.entered)}${per(checked.packQty)} checked ${checked.checkedAt}`;

  const list = listPriceFor(key);

  return list ? `≈ ${formatMoney(list.usd)}${per(list.per)} list at ${list.store}, ${list.seen}` : 'no price';
}

export function priceText(key: string, ctx?: CatalogContext): string {
  const stock = stockText(key, ctx);

  return `${stock ? `${stock} · ` : ''}${listedPrice(key, ctx)}`;
}

const verdictWord = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };

function marginText(act: ActuatorSpec, ctx: CatalogContext): string {
  const rating = ratingAt(act, ctx.volts);
  const parts: string[] = [];

  if (ctx.stance) {
    const v = stanceVerdict(ctx.stance.nm, rating);

    parts.push(`${ctx.stance.joint} stance ${v.stallShare.toFixed(2)} of stall ${verdictWord[v.status]}`);
  }

  if (ctx.hold) {
    const v = holdVerdict(ctx.hold.nm, rating);

    parts.push(`${ctx.hold.joint} holding ${v.stallShare.toFixed(2)} of stall ${verdictWord[v.status]}`);
  }

  return parts.length ? `; at ${Math.round(rating.volts * 10) / 10} V: ${parts.join(', ')}` : '';
}

export function actuatorValue(act: ActuatorSpec, key: string, ctx?: CatalogContext): string {
  const price = unitPrice(key, ctx);
  const money = currentMoney();
  const perDollar = price ? `, ${(act.stallNm / money.fromUsd(price)).toFixed(3)} N·m/${money.symbol}` : '';

  return `${priceText(key, ctx)}${perDollar}${ctx && act.bus ? marginText(act, ctx) : ''}`;
}

export function hardwarePrices(type: string, ctx?: CatalogContext): string {
  const prefix = `hardware:${type}|`;
  const owned = ownedKeys(ctx).filter((k) => k.startsWith(prefix));
  const keys = [...new Set([...owned, ...Object.keys(LIST_PRICES).filter((k) => k.startsWith(prefix))])];

  if (!keys.length) return '';

  return `; prices: ${keys.map((k) => `${k.slice(prefix.length)} ${priceText(k, ctx)}`).join('; ')}`;
}

function ownedNote(key: string, ctx: CatalogContext): string {
  const onHand = onHandOf(ctx.purchases[key]);
  const left = onHand - usedOf(key, ctx);

  return `${key} ${onHand} (${left >= 0 ? `${left} left` : `${-left} to buy`})`;
}

export function catalogHeader(ctx?: CatalogContext, listed: (key: string) => boolean = () => true): string[] {
  if (!ctx) return [];

  const lines: string[] = [];
  const b = ctx.budget;

  if (b) {
    const left = b.budgetUsd - b.estimatedUsd;

    lines.push(
      `Budget ${formatWhole(b.budgetUsd)}; this scene ≈ ${formatWhole(b.estimatedUsd)} so far (${left >= 0 ? `${formatWhole(left)} left` : `${formatWhole(-left)} over`}).`,
    );
  }

  const owned = ownedKeys(ctx).filter(listed);

  if (owned.length)
    lines.push(`The user owns: ${owned.map((key) => ownedNote(key, ctx)).join(', ')}. Use these before buying others.`);

  const needs = [
    ctx.stance &&
      `${ctx.stance.nm.toFixed(2)} N·m in stance at ${ctx.stance.joint}${ctx.stance.crouchDeg ? ` (${angle(ctx.stance.crouchDeg)} crouch)` : ''}`,
    ctx.hold && `${ctx.hold.nm.toFixed(2)} N·m holding at ${ctx.hold.joint}`,
  ].filter(Boolean);

  if (needs.length)
    lines.push(
      `Hardest joints in this scene: ${needs.join('; ')}. Each actuator shows its margin against them (PASS ≤ 0.40 of stall); size_actuators picks per joint.`,
    );

  return lines.length ? [...lines, ''] : [];
}
