import type { HubDatasetFiles, HubRepoRef } from '../../hub/hubBridge';
import { base64ToBytes } from '../../utils/base64';
import { hubLink } from '../../utils/robotImport/hub';
import type { ImportSource } from './readSource';

export function hubDatasetRef(url: string): HubRepoRef | null {
  const link = hubLink(url);

  return link?.kind === 'datasets' ? { owner: link.owner, repo: link.repo, rev: link.rev } : null;
}

export function hubImportSource(reply: HubDatasetFiles): ImportSource | null {
  const paths = Object.keys(reply.files);

  if (!paths.length) return null;

  return {
    kind: 'files',
    name: reply.repo,
    files: paths.map((path) => ({
      path,
      blob: new Blob([base64ToBytes(reply.files[path]) as Uint8Array<ArrayBuffer>]),
    })),
  };
}
