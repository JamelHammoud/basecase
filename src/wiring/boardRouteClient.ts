import type { BoardNativeRequest, BoardRouteResult } from './boardRoutingTypes';
import type { BoardRoutePlan } from './boardRouteContract.mjs';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { boardImportMessage } from './boardRoutingFindings';
import { errorMessage } from '../utils/errorMessage';

export async function routeNativeCopper(
  input: { request: BoardNativeRequest; plan: BoardRoutePlan },
  signal: AbortSignal,
) {
  signal.throwIfAborted();

  if (IS_WEB_DEMO) throw new Error(boardImportMessage('board-router'));

  const cancel = () => {
    void channelCall(electron()?.electricalCall, 'electrical:cancel', input.request.id).catch(() => undefined);
  };

  signal.addEventListener('abort', cancel, { once: true });

  try {
    const result = await channelCall<BoardRouteResult>(electron()?.electricalCall, 'electrical:route', input);

    signal.throwIfAborted();

    return result;
  } catch (error) {
    const code = errorMessage(error);

    throw new Error(boardImportMessage(code.startsWith('board-') ? code : 'board-route-failed'), { cause: error });
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
