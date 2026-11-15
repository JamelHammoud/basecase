import { deliver } from '../lib/deliver.mjs';
import { pendingDeliveries } from '../lib/deliveryState.mjs';
import { close } from '../lib/worktree.mjs';
import { claim } from '../lib/claim.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: 'Retries durable pushes and pull request creation without repeating implementation or writing',
};

export default function delivery({ log }) {
  for (const entry of pendingDeliveries()) {
    const release = entry.number ? claim(`pull-${entry.number}`) : () => {};

    if (!release) continue;

    try {
      const url = deliver(entry);

      if (!url) continue;

      log(`delivered ${url} from existing verified work`);
      close(entry);
    } catch (error) {
      log(`${entry.branch}: delivery failed: ${error.message}`);
    } finally {
      release();
    }
  }
}
