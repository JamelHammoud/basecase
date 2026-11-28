import { base64ToBytes } from '../utils/base64';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';

import type { RoboflowContinuation, RoboflowPending } from '../../electron/roboflow/index.mjs';

export type { RoboflowContinuation, RoboflowPending } from '../../electron/roboflow/index.mjs';

type ArchiveReply = { kind: 'complete'; name: string; data: Uint8Array | string };

export interface RoboflowAccountState {
  saved: boolean;
}

const call = <T>(channel: string, payload?: unknown) => channelCall<T>(electron()?.roboflowCall, channel, payload);
const asAccount = (value: unknown): RoboflowAccountState => ({
  saved: (value as RoboflowAccountState)?.saved === true,
});

export const roboflowBridge = {
  account: async () => asAccount(await call('roboflow:account')),
  setKey: async (key: string) => asAccount(await call('roboflow:set-key', key)),
  importProject: async (link: string | RoboflowContinuation, active = () => true) => {
    const reply = await call<ArchiveReply | RoboflowPending>('roboflow:import', link);

    if (!active()) return null;

    if (reply.kind === 'pending') return reply;

    const bytes = typeof reply.data === 'string' ? base64ToBytes(reply.data) : new Uint8Array(reply.data);

    return {
      kind: 'zip' as const,
      name: reply.name,
      blob: new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }),
    };
  },
};

export async function roboflowImportSource(
  link: string | RoboflowContinuation,
  openAccounts: () => void,
  active = () => true,
) {
  const account = await roboflowBridge.account();

  if (!active()) return null;

  if (!account.saved) {
    openAccounts();

    return null;
  }

  return roboflowBridge.importProject(link, active);
}
