import { reply } from '../utils/workerRpc';
import { prelabelFrameLabels, type PrelabelFrameInput } from './prelabelsGeometry';

export const prelabelsJobs = { labels: (input: PrelabelFrameInput) => reply(prelabelFrameLabels(input)) };
