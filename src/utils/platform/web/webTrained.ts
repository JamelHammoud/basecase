import { idbGet, idbPut } from './idb';

const policyKey = (id: string) => `policy:${id}`;
const skillKey = (hash: string) => `skill:${hash}`;

export const keepPolicy = (id: string, spec: unknown) => idbPut('trained', policyKey(id), spec);

export const keepSkill = (hash: string, skill: unknown) => idbPut('trained', skillKey(hash), skill);

export const trainedPolicy = async (id: string) => (id ? ((await idbGet('trained', policyKey(id))) ?? null) : null);

export const trainedSkill = async (hash: string) => (hash ? ((await idbGet('trained', skillKey(hash))) ?? null) : null);
