export interface RepairContext {
  repairPart: (id: string) => Promise<{ text: string }>;
}

async function repairPart(payload: Record<string, unknown>, ctx: RepairContext) {
  const id = payload.id;

  if (typeof id !== 'string' || !id.trim() || id.length > 200) return { text: 'Choose a part to repair.' };

  const reply = await ctx.repairPart(id);

  return { text: reply.text };
}

export const REPAIR_HANDLERS = { repair_part: repairPart };
