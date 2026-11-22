import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { sameProjectInputs } from '../utils/projectInputs';
import type { ProjectSettings } from '../types/robotics';

export function useProjectInputsChange(
  project: ProjectSettings,
  onChange: () => void,
  equal: (before: ProjectSettings, now: ProjectSettings) => boolean = sameProjectInputs,
) {
  const previous = useRef(project);
  const changed = useEffectEvent(onChange);

  useLayoutEffect(() => {
    const same = equal(previous.current, project);

    previous.current = project;

    if (!same) changed();
  }, [project, equal]);
}
