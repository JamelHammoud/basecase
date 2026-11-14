import { fileResponse } from '../binaryAsset.mjs';
import { MODEL_ASSET_PREFIX } from './modelPolicy.mjs';

export function modelAsset(models, request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith(MODEL_ASSET_PREFIX)) return null;

  try {
    const hash = url.pathname.slice(MODEL_ASSET_PREFIX.length);
    const asset = models?.asset(hash);

    return asset ? fileResponse(asset.file, request) : new Response(null, { status: 404 });
  } catch {
    return new Response(null, { status: 404 });
  }
}
