import { useState } from 'react';
import { errorMessage } from '../../utils/errorMessage';
import { sharedTagsOf, tagTries } from '../../workspace/tagTries';

export interface TagTarget {
  x: number;
  y: number;
  ids: string[];
  before: string[];
}

export function useTagTries(onError: (message: string) => void) {
  const [target, setTarget] = useState<TagTarget | null>(null);

  const open = (ids: string[], at: { x: number; y: number }) =>
    void sharedTagsOf(ids)
      .then((before) => setTarget({ ...at, ids, before }))
      .catch((e: unknown) => onError(errorMessage(e)));

  const done = (text: string | null) => {
    const was = target;

    setTarget(null);

    if (was && text !== null) tagTries(was.ids, text, was.before).catch((e: unknown) => onError(errorMessage(e)));
  };

  return { target, open, done };
}
