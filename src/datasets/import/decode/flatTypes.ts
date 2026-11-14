import { FLAT_SIZE } from './flatWire';

export interface FlatType {
  base: number;
  element: number;
  index: number;
  length: number;
}
export interface FlatField {
  name: string;
  type: FlatType;
  id: number;
  offset: number;
  integer: bigint;
  real: number;
  optional: boolean;
  required: boolean;
}
export interface FlatObject {
  name: string;
  fields: FlatField[];
  struct: boolean;
  size: number;
  align: number;
}
export interface FlatEnum {
  name: string;
  union: boolean;
  type: FlatType;
  values: Map<bigint, { name: string; type: FlatType | null }>;
}
export interface FlatSchema {
  objects: FlatObject[];
  enums: FlatEnum[];
}

export function flatWidth(schema: FlatSchema, t: FlatType): number {
  if (t.base === 15 && schema.objects[t.index]?.struct) return schema.objects[t.index].size;

  if (t.base === 17) return t.length * flatWidth(schema, { ...t, base: t.element, element: 0 });

  return FLAT_SIZE[t.base] ?? 0;
}
