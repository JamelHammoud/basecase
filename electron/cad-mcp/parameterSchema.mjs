import { z } from 'zod';
import { idSchema } from './schemas.mjs';

const unit = z.enum(['mm', 'deg', '1']);
const name = z.string().min(1).max(48);
const expression = z.string().min(1).max(256);
const kind = z.enum(['primitive', 'cad', 'sketch']);
const target = z.string().min(1).max(256);
const binding = z.object({ kind, target, unit, expression });
const parameter = z.union([z.object({ name, unit, value: z.number().finite() }), z.object({ name, unit, expression })]);

export const parameterEditsSchema = z
  .array(
    z.discriminatedUnion('op', [
      z.object({ op: z.literal('set'), parameter }),
      z.object({ op: z.literal('rename'), name, to: name }),
      z.object({ op: z.literal('delete'), name, resolution: z.literal('freeze').optional() }),
      z.object({ op: z.literal('bind'), part: idSchema, binding }),
      z.object({ op: z.literal('unbind'), part: idSchema, kind, target }),
    ]),
  )
  .max(128)
  .optional();
