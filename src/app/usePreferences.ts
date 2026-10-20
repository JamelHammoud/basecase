import { useEffect, useState } from 'react';
import type { MeasureUnit, TrackpadGestureMode } from '../types/robotics';
import { loadPreferences, writeStored } from './storedSettings';

export function usePreferences() {
  const [saved] = useState(loadPreferences);
  const [snapStepMm, setSnapStepMm] = useState<number>(saved.snapStepMm);
  const [snapAngleDeg, setSnapAngleDeg] = useState<number>(saved.snapAngleDeg);
  const [trackpadMode, setTrackpadMode] = useState<TrackpadGestureMode>(saved.trackpadMode);
  const [showGrid, setShowGrid] = useState<boolean>(saved.showGrid);
  const [sculptEnabled, setSculptEnabled] = useState<boolean>(saved.sculptEnabled);
  const [measureUnit, setMeasureUnit] = useState<MeasureUnit>(saved.measureUnit);
  const [showReferenceImages, setShowReferenceImages] = useState(true);

  useEffect(() => {
    writeStored('preferences', { snapStepMm, snapAngleDeg, trackpadMode, showGrid, sculptEnabled, measureUnit });
  }, [snapStepMm, snapAngleDeg, trackpadMode, showGrid, sculptEnabled, measureUnit]);

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
    measureUnit,
    setMeasureUnit,
    showReferenceImages,
    setShowReferenceImages,
  };
}
