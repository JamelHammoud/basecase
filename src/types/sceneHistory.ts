import type { SavedSceneRecord } from './robotics';

export type VersionedSceneRecord = SavedSceneRecord & { history?: string };
