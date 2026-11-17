import type { BoardFabricationRules } from './boardRoutingTypes';

export interface BoardRoutePlan {
  source: string;
  trackWidthMm: number | null;
  clearanceMm: number | null;
  viaDiameterMm: number | null;
  viaDrillMm: number | null;
  copperMm: number | null;
  dielectricMaterial: string;
  epsilonR: number | null;
  lossTangent: number | null;
  special: string;
}
export function validRoutePlan(value: unknown): value is BoardRoutePlan;
export function checkedRoutePlan(value: unknown, rules: BoardFabricationRules | null): BoardRoutePlan;
export function routeStackup(plan: BoardRoutePlan, thickness: number): string;
export function checkedSession(text: string): string;
