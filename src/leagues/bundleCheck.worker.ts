import { errorMessage } from '../utils/errorMessage';
import type { BundleCheckJob, BundleCheckReply } from './bundleCheck';
import { verifyEntryBundle } from './validation';

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<BundleCheckJob>) => void) | null;
  postMessage: (reply: BundleCheckReply) => void;
};

worker.onmessage = ({ data }) => {
  try {
    worker.postMessage({ bundle: verifyEntryBundle(data.manifest, data.entry, data.bytes) });
  } catch (error) {
    worker.postMessage({ error: errorMessage(error) });
  }
};
