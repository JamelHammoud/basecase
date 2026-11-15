import { useVisionScope } from '../cameras/visionScope';
import { useEffect } from 'react';
import { operatorCameraSnapshot, teachGestures, useOperatorCamera } from '../cameras/operator/operatorCamera';
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
  const { source } = useVisionScope().operator;
  const cameraOpen = useOperatorCamera(source).open;
  const id = cases.active?.id;
  const stored = project.cases?.find((c) => c.id === id)?.gestures;

  useEffect(() => {
    if (!active || !cameraOpen) return;

    teachGestures((stored ?? []).filter((g) => g.examples.length));

    return () => {
      if (operatorCameraSnapshot(source).open) teachGestures([]);
    };
  }, [active, stored, cameraOpen, source]);

  useEffect(() => {
    if (active && !cameraOpen) closeTeachGesture();
  }, [active, cameraOpen]);

  if (!open || !active || !cameraOpen || !cases.active) return null;

  return (
    <TeachGestureSheet gestures={cases.active.gestures} onTaught={cases.saveGesture} onClose={closeTeachGesture} />
  );
}
