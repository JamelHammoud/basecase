import { useEffect, useEffectEvent, useState } from 'react';
import { StartupLease } from './startupLease';

export function useStartupLease(
  scope: unknown,
  subscribeStop: (listener: () => void) => () => void,
  onCancel?: () => void,
) {
  const [lease] = useState(() => new StartupLease());
  const cancel = useEffectEvent(() => {
    lease.cancel();
    onCancel?.();
  });

  useEffect(() => {
    const stop = subscribeStop(cancel);

    return () => {
      stop();
      cancel();
    };
  }, [scope, subscribeStop]);

  return lease;
}
