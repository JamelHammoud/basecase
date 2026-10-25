export const SIMREADY_HOST = 'https://nvidia-simready-central.hf.space';

export type SimReadyShelf = 'objects' | 'robots';

const ROBOT_MAKERS = [
  'onrobot',
  'Robotiq-Official',
  'frankarobotics',
  'TeradyneRobotics',
  'FANUC-CORPORATION',
  'Comau',
  'standardbots',
  'agibot-assets',
  'AGIBOT-Yuanzheng',
  'Menlo',
];
const OBJECT_MAKERS = ['nvidia', 'ForgeCAD', 'PalatialSim', 'LGElectronics', 'Vertiv'];
const SHELF_FILTER: Record<SimReadyShelf, string> = {
  objects: `.*/datasets/(${OBJECT_MAKERS.join('|')})/.*`,
  robots: `.*/datasets/(${ROBOT_MAKERS.join('|')})/.*`,
};

export interface SimReadyAsset {
  url: string;
  name: string;
  maker: string;
  license: string;
  caption: string;
  sizeMm: [number, number, number] | null;
  massKg: number | null;
  bodies: number | null;
  thumbnail: string;
}

interface SearchHit {
  url: string;
  default_prims?: Array<{
    properties?: Record<string, string>;
    bbox_dimension_x?: number;
    bbox_dimension_y?: number;
    bbox_dimension_z?: number;
  }>;
  vision_generated_metadata?: Record<string, Array<{ name: string; value_text?: string[] }>>;
}

export const isRobotUrl = (url: string) => ROBOT_MAKERS.some((m) => url.includes(`/datasets/${m}/`));

export const thumbnailUrl = (assetUrl: string) => `${SIMREADY_HOST}/images?asset_url=${encodeURIComponent(assetUrl)}`;

const packageName = (url: string) => url.split('/blob/')[1]?.split('/')[1] ?? 'asset';

function prettyWords(raw: string): string {
  const words = raw
    .replace(/^sm_/, '')
    .replace(/_0\d$/, '')
    .split(/[_\s-]+/)
    .filter(Boolean);

  return words.map((w) => (/\d/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

function vision(hit: SearchHit, field: string): string {
  const groups = Object.values(hit.vision_generated_metadata ?? {}).flat();

  return groups.find((g) => g.name === field)?.value_text?.[0] ?? '';
}

function sentence(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function maker(props: Record<string, string>, url: string): string {
  const author = props.simready_metadata_author?.split(/[;(]/)[0].trim();

  return author || (url.split('/datasets/')[1]?.split('/')[0] ?? '').replace(/-/g, ' ');
}

function sizeOf(prim: NonNullable<SearchHit['default_prims']>[number] | undefined): SimReadyAsset['sizeMm'] {
  const { bbox_dimension_x: x, bbox_dimension_y: y, bbox_dimension_z: z } = prim ?? {};

  if (x === undefined || y === undefined || z === undefined) return null;

  return [Math.round(x * 1000), Math.round(z * 1000), Math.round(y * 1000)];
}

function num(v: string | undefined): number | null {
  const n = v === undefined ? NaN : Number(v);

  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toAsset(hit: SearchHit): SimReadyAsset {
  const prim = hit.default_prims?.[0];
  const props = prim?.properties ?? {};
  const robot = isRobotUrl(hit.url);
  const objectType = vision(hit, 'object_type');
  const name = robot || !objectType ? prettyWords(props.simready_metadata_asset_name || packageName(hit.url)) : '';

  return {
    url: hit.url,
    name: name || sentence(objectType),
    maker: maker(props, hit.url),
    license: props.simready_metadata_asset_license ?? '',
    caption: vision(hit, 'caption'),
    sizeMm: sizeOf(prim),
    massKg: num(props.simready_metadata_mass),
    bodies: num(props.simready_metadata_rigid_body_count),
    thumbnail: thumbnailUrl(hit.url),
  };
}

export interface SimReadyQuery {
  query: string;
  shelf: SimReadyShelf;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export function searchBody({ query, shelf, limit = 40, offset = 0 }: SimReadyQuery) {
  const q = query.trim();

  return {
    ...(q
      ? {
          hybrid_text_query: q,
          vector_queries: [{ field_name: 'siglip2-embedding.embedding', query_type: 'text', query: q }],
        }
      : {}),
    filter_url_regexp: SHELF_FILTER[shelf],
    file_extension_include: 'usd*',
    return_default_prims: true,
    return_vision_generated_metadata: true,
    deduplicate_by_hash: true,
    limit,
    offset,
  };
}

const known = new Map<string, SimReadyAsset>();

export function knownAsset(url: string): Pick<SimReadyAsset, 'url' | 'name' | 'maker' | 'license'> {
  const hit = known.get(url);

  if (hit) return hit;

  return {
    url,
    name: prettyWords(packageName(url)),
    maker: url.split('/datasets/')[1]?.split('/')[0] ?? '',
    license: '',
  };
}

export async function searchSimReady(q: SimReadyQuery): Promise<SimReadyAsset[]> {
  const res = await fetch(`${SIMREADY_HOST}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchBody(q)),
    signal: q.signal,
  });

  if (!res.ok) throw new Error(`SimReady search failed (${res.status}).`);

  const hits = (await res.json()) as SearchHit[];

  const assets = Array.isArray(hits) ? hits.map(toAsset) : [];

  for (const a of assets) known.set(a.url, a);

  return assets;
}
