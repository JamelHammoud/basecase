import { cancelObsoleteRuns } from '../lib/staleRuns.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 300,
  does: 'Cancels workflow runs for closed loop pull requests and superseded pull heads, including CodeQL',
};

export default function ci({ log }) {
  cancelObsoleteRuns(log);
}
