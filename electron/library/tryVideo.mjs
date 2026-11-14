import { fileResponse } from '../binaryAsset.mjs';

export function tryVideoAsset(store, request) {
  const url = new URL(request.url);

  if (url.pathname !== '/api/try-video') return null;

  try {
    return fileResponse(store.videoFile(url.searchParams.get('id')), request, 'video/mp4');
  } catch {
    return new Response(null, { status: 400 });
  }
}
