import { useCallback, useState } from 'react';
import type { Controller } from './engine';
import type { SimRequest } from './sim.worker';

export function useSimController(send: (msg: SimRequest) => void) {
  const [controller, setControllerState] = useState<Controller>({ kind: 'hold' });
  const setController = useCallback(
    (c: Controller) => {
      setControllerState(c);
      send({ type: 'controller', controller: c });
    },
    [send],
  );

  return [controller, setController] as const;
}
