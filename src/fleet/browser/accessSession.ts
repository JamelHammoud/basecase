import { createContext, useContext, useEffect, useState } from 'react';
import { accessScope } from './accessScope';

export const AccessSession = createContext<{ signal: AbortSignal; onDenied: () => void } | null>(null);

export function useAccessRequest() {
  const session = useContext(AccessSession);
  const [scope] = useState(() => accessScope(() => session?.onDenied(), session?.signal));

  useEffect(() => () => scope.close(), [scope]);

  return scope.request;
}
