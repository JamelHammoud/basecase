export interface LightenSettings {
  targetShare: number;
  minWallMm?: number;
}

export interface LightenContext {
  lightenPart: (id: string, settings: LightenSettings) => Promise<{ text: string }>;
}

async function lightenPart(payload: Record<string, unknown>, ctx: LightenContext) {
  const id = payload.id;
  const targetShare = payload.target_share === undefined ? 0.5 : payload.target_share;
  const minWallMm = payload.min_wall_mm;

  if (typeof id !== 'string' || !id.trim() || id.length > 200) return { text: 'Choose a printed part to lighten.' };

  if (typeof targetShare !== 'number' || !Number.isFinite(targetShare) || targetShare <= 0 || targetShare >= 1)
    return { text: 'Choose a target share greater than 0 and less than 1.' };

  if (minWallMm !== undefined && (typeof minWallMm !== 'number' || !Number.isFinite(minWallMm) || minWallMm < 1))
    return { text: 'Choose a minimum wall of at least 1 mm.' };

  const reply = await ctx.lightenPart(id.trim(), { targetShare, minWallMm });

  return { text: reply.text };
}

export const LIGHTEN_HANDLERS = { lighten_part: lightenPart };
