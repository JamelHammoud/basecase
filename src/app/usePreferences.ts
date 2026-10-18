import { useEffect, useState } from 'react';
import type { TrackpadGestureMode } from '../types/robotics';
import { loadPreferences, writeStored } from './storedSettings';

export function usePreferences() {
  const [saved] = useState(loadPreferences);
  const [snapStepMm, setSnapStepMm] = useState<number>(saved.snapStepMm);
  const [snapAngleDeg, setSnapAngleDeg] = useState<number>(saved.snapAngleDeg);
  const [trackpadMode, setTrackpadMode] = useState<TrackpadGestureMode>(saved.trackpadMode);
  const [showGrid, setShowGrid] = useState<boolean>(saved.showGrid);
  const [sculptEnabled, setSculptEnabled] = useState<boolean>(saved.sculptEnabled);
  const [showReferenceImages, setShowReferenceImages] = useState(true);

  useEffect(() => {
    writeStored('preferences', { snapStepMm, snapAngleDeg, trackpadMode, showGrid, sculptEnabled });
  }, [snapStepMm, snapAngleDeg, trackpadMode, showGrid, sculptEnabled]);

  return {
    snapStepMm,
    setSnapStepMm,
    snapAngleDeg,
    setSnapAngleDeg,
    trackpadMode,
    setTrackpadMode,
    showGrid,
    setShowGrid,
    sculptEnabled,
    setSculptEnabled,
    showReferenceImages,
    setShowReferenceImages,
  };
}
