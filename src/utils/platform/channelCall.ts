import { post } from './transport';
import { errorMessage } from '../errorMessage';

type Invoke = ((channel: string, payload?: unknown) => Promise<unknown>) | undefined;

export async function channelCall<T>(
  invoke: Invoke,
  channel: string,
  payload?: unknown,
  forHttp: (payload: unknown) => unknown = (p) => p,
): Promise<T> {
  try {
    if (invoke) return (await invoke(channel, payload)) as T;

    const res = await post<T & { error?: string }>(`/${channel.replace(':', '-')}`, { arg: forHttp(payload) });

    if (res && typeof res === 'object' && 'error' in res && res.error) throw new Error(res.error);

    return res;
  } catch (e) {
    throw new Error(errorMessage(e), { cause: e });
  }
}
