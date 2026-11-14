import type { PoseReply } from '../agent/agentPoseShared';
import type { FleetTools, RollOutAsk } from '../fleet/fleetTools';

type Payload = Record<string, unknown>;

export const NO_FLEET = 'Connect an emulated robot first.';

export const FLEET_TOOL_KINDS = ['roll_out', 'roll_back'];

export interface FleetToolContext {
  fleet?: FleetTools;
  setAction: (action: string) => void;
}

export function selectUnit(fleet: FleetTools | undefined, unit: unknown): string | null {
  if (typeof unit !== 'string') return null;

  return fleet ? fleet.select(unit) : NO_FLEET;
}

export async function runFleetTool(kind: string, payload: Payload, ctx: FleetToolContext): Promise<PoseReply> {
  if (!ctx.fleet) return { text: NO_FLEET };

  if (kind === 'roll_out') {
    ctx.setAction('Rolling out');

    return { text: await ctx.fleet.rollOut(payload as unknown as RollOutAsk) };
  }

  if (kind === 'roll_back') {
    ctx.setAction('Rolling back');

    return { text: await ctx.fleet.rollBack(String(payload.unit ?? '')) };
  }

  throw new Error(`Unknown fleet tool "${kind}"`);
}
