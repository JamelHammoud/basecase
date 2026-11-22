import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { bodyProjectUnchanged } from '../reality/bodySource';
import type { ProjectSettings } from '../types/robotics';

export function useBodyProjectChange(project: ProjectSettings, onChange: () => void) {
  const previous = useRef(project);
  const changed = useEffectEvent(onChange);

  useLayoutEffect(() => {
    const same = bodyProjectUnchanged(previous.current, project);

    previous.current = project;

    if (!same) changed();
  }, [project]);
}
