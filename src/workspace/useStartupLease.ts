import { useEffect, useEffectEvent, useState } from 'react';
import { StartupLease } from './startupLease';

export function useStartupLease(
  scope: unknown,
  subscribeStop: (listener: () => void) => () => void,
  onCancel?: () => void,
  keepOnStop?: () => boolean,
) {
  const [lease] = useState(() => new StartupLease());
  const cancel = useEffectEvent(() => {
    lease.cancel();
    onCancel?.();
  });

  const stopped = useEffectEvent(() => {
    if (!keepOnStop?.()) cancel();
  });

  useEffect(() => {
    const stop = subscribeStop(stopped);

    return () => {
      stop();
      cancel();
    };
  }, [scope, subscribeStop]);

  return lease;
}
