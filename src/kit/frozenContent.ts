import { sha256Hex, isHash } from '../skills/hash';
import { KIT_MAX_BYTES } from './limits';
import type { FrozenKit } from './frozenKit';

export interface FrozenAsset {
  hash: string;
  text: string;
  bytes: number;
}

export interface PreparedFrozenKit extends FrozenAsset {
  assets: Record<string, FrozenAsset>;
}

type StoredKit = Omit<FrozenKit, 'parts' | 'project' | 'geometry' | 'outputs' | 'provenance'> & {
  parts: string[];
  project: string;
  geometry: Record<string, string>;
  outputs: Record<string, string>;
  provenance: string;
};

function assetOf(value: unknown): FrozenAsset {
  const text = JSON.stringify(value, (_key, entry: unknown) =>
    ArrayBuffer.isView(entry) ? Array.from(entry as unknown as ArrayLike<number>) : entry,
  );
  const bytes = new TextEncoder().encode(text);

  if (bytes.byteLength > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

  return { hash: sha256Hex(bytes), text, bytes: bytes.byteLength };
}

export function frozenKitContent(kit: FrozenKit): PreparedFrozenKit {
  const assets: Record<string, FrozenAsset> = {};
  const retain = (value: unknown) => {
    const asset = assetOf(value);

    assets[asset.hash] = asset;

    return asset.hash;
  };
  const stored: StoredKit = {
    ...kit,
    parts: kit.parts.map(retain),
    project: retain(kit.project),
    geometry: Object.fromEntries(Object.entries(kit.geometry).map(([id, mesh]) => [id, retain(mesh)])),
    outputs: Object.fromEntries(Object.entries(kit.outputs).map(([name, bytes]) => [name, retain(bytes)])),
    provenance: retain(kit.provenance),
  };
  const root = assetOf(stored);
  const total = Object.values(assets).reduce((sum, asset) => sum + asset.bytes, root.bytes);

  if (total > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

  return { ...root, assets };
}

function checkedAsset(asset: FrozenAsset, hash: string) {
  if (
    !asset ||
    !isHash(hash) ||
    asset.hash !== hash ||
    typeof asset.text !== 'string' ||
    asset.text.length > KIT_MAX_BYTES
  )
    throw new Error('The build kit is damaged.');

  const bytes = new TextEncoder().encode(asset.text);

  if (bytes.byteLength !== asset.bytes || sha256Hex(bytes) !== hash) throw new Error('The build kit is damaged.');

  return JSON.parse(asset.text);
}

export function hydrateFrozenKit(content: PreparedFrozenKit): FrozenKit {
  const stored: StoredKit = checkedAsset(content, content?.hash);
  const assets = content.assets;

  if (!assets || !Array.isArray(stored.parts)) throw new Error('The build kit is damaged.');

  const total = Object.values(assets).reduce((sum, asset) => sum + asset.bytes, content.bytes);

  if (total > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

  const read = (hash: string) => checkedAsset(assets[hash], hash);

  return {
    ...stored,
    parts: stored.parts.map(read),
    project: read(stored.project),
    geometry: Object.fromEntries(Object.entries(stored.geometry).map(([id, hash]) => [id, read(hash)])),
    outputs: Object.fromEntries(Object.entries(stored.outputs).map(([name, hash]) => [name, read(hash)])),
    provenance: read(stored.provenance),
  };
}
