import { isJsonPath, sessionOf, tilePathOf } from './tilePaths';

export type FetchTile = (path: string) => Promise<Uint8Array>;

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
