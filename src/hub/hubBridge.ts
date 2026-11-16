import { bytesToBase64 } from '../utils/base64';
import type { VisionModelFile } from '../vision/manifest';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';

export interface HubAccountState {
  signedIn: boolean;
  name: string | null;
}

export interface HubPublish {
  name: string;
  files: Record<string, Uint8Array>;
  kind?: 'dataset' | 'model';
  tag?: string;
  includeRevision?: boolean;
}

export interface HubRepoRef {
  owner: string;
  repo: string;
  rev: string;
}

export interface HubSkillFiles {
  repo: string;
  revision: string;
  files: Record<string, string>;
}

export interface HubSkillCandidate extends HubSkillFiles {
  revision: string;
}

export interface HubDatasetFiles {
  repo: string;
  revision: string;
  files: Record<string, Uint8Array | string>;
}

export interface HubPublished {
  repo: string;
  url: string;
  revision?: string;
}

const forHttp = (payload: unknown) => {
  const job = payload as Partial<HubPublish> | undefined;

  if (!job?.files) return payload;

  return { ...job, files: Object.fromEntries(Object.entries(job.files).map(([p, b]) => [p, bytesToBase64(b)])) };
};

const call = <T>(channel: string, payload?: unknown) => channelCall<T>(electron()?.hubCall, channel, payload, forHttp);

function asAccount(value: unknown): HubAccountState {
  const v = (value ?? {}) as Partial<HubAccountState>;

  return { signedIn: !!v.signedIn, name: typeof v.name === 'string' ? v.name : null };
}

const account = async () => asAccount(await call('hub:account'));

export const hubBridge = {
  account,
  signedIn: () =>
    account().then(
      (a) => a.signedIn,
      () => false,
    ),
  signIn: async (token: string) => asAccount(await call('hub:sign-in', token)),
  publish: (payload: HubPublish) => call<HubPublished>('hub:publish', payload),
  skillFiles: (ref: HubRepoRef) => call<HubSkillFiles>('hub:skill-files', ref),
  modelFile: (ref: VisionModelFile) => call<{ url: string }>('hub:model-file', ref),
  findSkills: () => call<HubSkillCandidate[]>('hub:find-skills'),
  publishSkillOutcome: (record: unknown) =>
    call<{ stored: boolean; published: boolean }>('hub:publish-skill-outcome', record),
  skillOutcomes: () => call<unknown[]>('hub:skill-outcomes'),
  datasetFiles: (ref: HubRepoRef) => call<HubDatasetFiles>('hub:dataset-files', ref),
};
