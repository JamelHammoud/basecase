import { z } from 'zod';

const coefficient = z.number().finite().min(-10000).max(10000);

export const tendonSchema = z
  .object({
    spool: z.object({ coefficient, unit: z.literal('mm/rad') }),
    terms: z
      .array(z.object({ joint: z.string(), coefficient, unit: z.enum(['mm/rad', 'mm/mm']) }))
      .min(1)
      .max(32),
    law: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('fixed'), lengthMm: z.number().finite().min(-100000).max(100000) }),
      z.object({
        kind: z.literal('elastic'),
        restLengthMm: z.number().finite().min(-100000).max(100000),
        stiffnessNPerMm: z.number().finite().positive().max(10000),
        dampingNsPerMm: z.number().finite().nonnegative().max(1000),
      }),
    ]),
  })
  .nullable()
  .optional();
