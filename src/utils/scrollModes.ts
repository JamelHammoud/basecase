import type { TrackpadGestureMode } from '../types/robotics';

export const NEXT_SCROLL_MODE: Record<TrackpadGestureMode, TrackpadGestureMode> = {
  'orbit-scroll': 'pan-scroll',
  'pan-scroll': 'zoom-scroll',
  'zoom-scroll': 'orbit-scroll',
};
