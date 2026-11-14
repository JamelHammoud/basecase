import { errorMessage } from '../utils/errorMessage';
import { isJsonPath, sessionOf, tilePathOf } from './tilePaths';

export type FetchTile = (path: string) => Promise<Uint8Array>;

export interface TileFetcher {
  fetchTile: FetchTile;
  forget: () => void;
  listen: (listener: (message: string) => void) => () => void;
}

export function tileFetcher(tile: FetchTile): TileFetcher {
  const warned = new Set<string>();
  const listeners = new Set<(message: string) => void>();

  return {
    fetchTile: async (path) => {
      try {
        return await tile(path);
      } catch (e) {
        const message = errorMessage(e);

        if (!warned.has(message)) listeners.forEach((listener) => listener(message));

        warned.add(message);

        throw e;
      }
    },
    forget: () => warned.clear(),
    listen: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
}

export class EarthFetchPlugin {
  readonly name = 'BASECASE_EARTH_FETCH';

  private session: string | null = null;

  private readonly fetchTile: FetchTile;

  constructor(fetchTile: FetchTile) {
    this.fetchTile = fetchTile;
  }

  async fetchData(url: string): Promise<unknown> {
    const path = tilePathOf(url, this.session);
    const bytes = await this.fetchTile(path);

    if (!isJsonPath(path)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));

    this.session ??= sessionOf(json);

    return json;
  }
}
