import { MCAP_DAMAGED } from '../ros2Cdr';
import { DataImportError } from '../types';

export const MCAP_TOO_LARGE = 'This recording is too large.';
export const SCHEMA_REFUSED = 'This recording’s message schema can’t be read.';

export const DECODE_LIMITS = {
  schemaBytes: 1024 * 1024,
  messageBytes: 64 * 1024 * 1024,
  depth: 32,
  types: 1024,
  fields: 8192,
  items: 1_000_000,
  nodes: 4_000_000,
};

export const damaged = () => new DataImportError(MCAP_DAMAGED);

export const refused = () => new DataImportError(SCHEMA_REFUSED);

export const tooLarge = () => new DataImportError(MCAP_TOO_LARGE);

export class Budget {
  #nodes = 0;

  spend(count: number) {
    if (count > DECODE_LIMITS.items) throw tooLarge();

    this.#nodes += count;

    if (this.#nodes > DECODE_LIMITS.nodes) throw tooLarge();
  }
}
