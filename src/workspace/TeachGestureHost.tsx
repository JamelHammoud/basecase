import { useEffect } from 'react';
import { teachGestures } from '../cameras/operator/operatorCamera';
import { TeachGestureSheet } from '../components/gestures/TeachGestureSheet';
import { closeTeachGesture, useTeachGestureOpen } from '../components/gestures/teachGestureStore';
import type { ProjectSettings } from '../types/robotics';
import type { Cases } from './useCases';

interface TeachGestureHostProps {
  active: boolean;
  cases: Cases;
  project: ProjectSettings;
}

export function TeachGestureHost({ active, cases, project }: TeachGestureHostProps) {
  const open = useTeachGestureOpen();
  const id = cases.active?.id;
  const stored = project.cases?.find((c) => c.id === id)?.gestures;

  useEffect(() => {
    if (!active) return;

    teachGestures((stored ?? []).filter((g) => g.examples.length));

    return () => teachGestures([]);
  }, [active, stored]);

  if (!open || !active || !cases.active) return null;

  return (
    <TeachGestureSheet gestures={cases.active.gestures} onTaught={cases.saveGesture} onClose={closeTeachGesture} />
  );
}
