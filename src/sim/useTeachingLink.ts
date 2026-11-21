import { useCallback, useEffect, useState, type RefObject } from 'react';
import { TeachingLink } from './teachingLink';
import type { SimRequest } from './simMessages';

export function useTeachingLink(worker: RefObject<Worker | null>) {
  const [link] = useState(() => new TeachingLink());
  const send = useCallback((message: SimRequest) => worker.current?.postMessage(message), [worker]);

  useEffect(() => {
    link.connect(send);

    return link.cancel;
  }, [link, send]);

  return { send, teaching: link };
}
