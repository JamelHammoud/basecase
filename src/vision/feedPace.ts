import { FRAME_MS } from '../cameras/feedProtocol';
import { VISION_FRAME_MS } from './frameTap';

interface FeedTiming {
  dirty: boolean;
  tiles: number;
  vision: number;
  drewAt: number;
  streamsAt: number;
}

export function nextFeedDraw({ dirty, tiles, vision, drewAt, streamsAt }: FeedTiming): number {
  const tilesAt = dirty && tiles ? drewAt + FRAME_MS : Infinity;
  const visionAt = vision ? drewAt + VISION_FRAME_MS : Infinity;

  return Math.min(tilesAt, visionAt, streamsAt);
}
