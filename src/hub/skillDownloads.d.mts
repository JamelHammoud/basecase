import type { HubRepoRef, HubSkillFiles } from './hubBridge';

export interface SkillClient {
  origin: string;
  api(path: string): Promise<Response>;

  download(path: string, options: { maxBytes: number; label: string }): Promise<Uint8Array>;

  revisionSha(repo: string, revision: string): Promise<string>;
}

export const COMMIT: RegExp;
export const SKILL_FILE_BYTES: number;
export const SKILL_DOWNLOADS: readonly string[];
export function checkedName(value: unknown): string;
export function checkedRevision(value: unknown): string;
export function readHubBytes(response: Response, maxBytes: number, label: string): Promise<Uint8Array>;
export function digest(bytes: Uint8Array, algorithm?: string): Promise<string>;
export function matchesFile(file: unknown, bytes: Uint8Array): Promise<boolean>;
export function skillFiles(client: SkillClient, ref: HubRepoRef): Promise<HubSkillFiles>;
