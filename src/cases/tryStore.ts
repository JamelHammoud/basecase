import type { Recording } from '../sim/recorder';
import { indexedDbStore } from '../utils/keyValueStore';

const recordings = indexedDbStore<Recording>({ database: 'basecase-tries', store: 'recordings', label: 'tries' });

export const saveRecording = (id: string, recording: Recording) => recordings.put(id, recording);

export const loadRecording = (id: string) => recordings.get(id);

export const deleteRecording = (id: string) => recordings.delete(id);
