import { useEffect, useEffectEvent } from 'react';
import { operatorState, subscribeOperator } from '../cameras/operator/operatorStore';
import type { ShowToast } from './types';

export function useCameraToast(showToast: ShowToast) {
  const say = useEffectEvent((message: string) => showToast(`Couldn’t open the camera: ${message}`, { tone: 'error' }));

  useEffect(() => {
    let seen = operatorState().failure?.at ?? 0;

    return subscribeOperator(() => {
      const failure = operatorState().failure;

      if (!failure || failure.at <= seen) return;

      seen = failure.at;
      say(failure.message);
    });
  }, []);
}
