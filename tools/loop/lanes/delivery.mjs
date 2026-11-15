import { deliver } from '../lib/deliver.mjs';
import { pendingDeliveries } from '../lib/deliveryState.mjs';
import { close } from '../lib/worktree.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 60,
  does: 'Retries durable pushes and pull request creation without repeating implementation or writing',
};

export default function delivery({ log }) {
  for (const entry of pendingDeliveries()) {
    const url = deliver(entry);

    if (!url) continue;

    log(`delivered ${url} from existing verified work`);
    close(entry);
  }
}
