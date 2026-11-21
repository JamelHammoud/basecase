import type { ScenePart } from '../../types/robotics';
import { errorMessage } from '../errorMessage';
import { recoverImportedSketch } from './importRecovery';

self.onmessage = ({ data }: MessageEvent<ScenePart>) => {
  try {
    const result = recoverImportedSketch(data);

    self.postMessage({ result: { ...result, part: { ...result.part, mesh: undefined } } });
  } catch (error) {
    self.postMessage({ error: errorMessage(error) });
  }
};
