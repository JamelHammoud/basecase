import { useEffect, useEffectEvent } from 'react';
import type { CaseTry } from './useCaseTry';

export function useBranchFocus(active: boolean, attempt: CaseTry) {
  const cancel = useEffectEvent(() => attempt.cancelBranch());

  useEffect(() => {
    if (!active) cancel();
  }, [active]);
}
