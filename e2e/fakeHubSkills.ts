import { gitBlob } from '../electron/hub/gitBlob.mjs';
import type { FakeRepo } from './fakeHub';

export const skillSiblings = (files: Map<string, Buffer>) =>
  [...files].map(([rfilename, bytes]) => ({ rfilename, size: bytes.length, blobId: gitBlob(bytes) }));

export function findModels(repos: Map<string, FakeRepo>, url: URL) {
  const tag = url.searchParams.get('filter');

  return [...repos].flatMap(([id, repo]) => {
    const card = repo.files.get('README.md')?.toString() ?? '';
    const matches =
      tag === 'basecase-skill' ? card.includes('- basecase-skill') : card.includes('library_name: basecase');

    return repo.kind === 'model' && matches ? [{ id }] : [];
  });
}
