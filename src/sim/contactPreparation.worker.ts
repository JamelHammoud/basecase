import { prepareContactJob, type ContactPreparationJob } from './contactPreparation';
import { errorMessage } from '../utils/errorMessage';

self.onmessage = async ({ data }: MessageEvent<ContactPreparationJob>) => {
  try {
    const result = await prepareContactJob(data);

    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: errorMessage(error) });
  }
};
