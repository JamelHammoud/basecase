import { errorMessage } from '../utils/errorMessage';
import { boardImportMessage } from './boardRoutingFindings';
import { channelCall } from '../utils/platform/channelCall';
import { electron } from '../utils/platform/transport';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { BoardNativeRequest, BoardNativeResult } from './boardRoutingTypes';

export async function validateNativeBoard(
  request: BoardNativeRequest,
  signal: AbortSignal,
): Promise<BoardNativeResult> {
  signal.throwIfAborted();

  if (IS_WEB_DEMO)
    return {
      key: request.key ?? '',
      version: null,
      issues: ['board-validator'],
      report: null,
      files: {},
      metrics: { cliMs: 0, outputBytes: 0 },
    };

  const cancel = () => {
    void channelCall(electron()?.electricalCall, 'electrical:cancel', request.id).catch(() => undefined);
  };

  signal.addEventListener('abort', cancel, { once: true });

  try {
    const result = await channelCall<BoardNativeResult>(electron()?.electricalCall, 'electrical:validate', request);

    signal.throwIfAborted();

    return result;
  } catch (error) {
    const message = errorMessage(error);

    if (message.startsWith('board-')) throw new Error(boardImportMessage(message), { cause: error });

    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
