import type { RenderedCad } from './types';

export interface CompiledCad extends RenderedCad {
  ok: true;
  positions: number[];
  indices: number[];
}

export const isCompiled = (rendered: RenderedCad): rendered is CompiledCad =>
  rendered.ok === true && !!rendered.positions?.length && !!rendered.indices?.length;
