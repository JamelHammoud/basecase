import type { HubDatasetFiles, HubRepoRef } from '../../hub/hubBridge';
import { hubLink } from '../../utils/robotImport/hub';
import type { ImportSource } from './readSource';

export function hubDatasetRef(url: string): HubRepoRef | null {
  const link = hubLink(url);

  return link?.kind === 'datasets' ? { owner: link.owner, repo: link.repo, rev: link.rev } : null;
}

export function hubImportSource(reply: HubDatasetFiles): ImportSource | null {
  return Object.keys(reply.files).length ? { kind: 'bytes', name: reply.repo, files: reply.files } : null;
}
