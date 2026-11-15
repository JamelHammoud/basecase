import { FLAT_SIZE } from './flatWire';

const UNSIGNED = new Set([1, 4, 6, 8, 10]);

export function flatInteger(base: number, value: bigint): bigint {
  return UNSIGNED.has(base) ? BigInt.asUintN(64, value) : value;
}

export function fitsFlatInteger(base: number, value: bigint): boolean {
  if (base < 1 || base > 10) return true;

  if (base === 2) return value === 0n || value === 1n;

  const unsigned = UNSIGNED.has(base);
  const bits = BigInt(FLAT_SIZE[base] * 8);
  const whole = flatInteger(base, value);
  const min = unsigned ? 0n : -(2n ** (bits - 1n));
  const max = unsigned ? 2n ** bits - 1n : 2n ** (bits - 1n) - 1n;

  return whole >= min && whole <= max;
}
