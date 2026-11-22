export type Box = readonly [number, number, number, number];
export type Point = readonly [number, number];

export interface TrackInput {
  label: string;
  score: number;
  box: Box;
}

export interface Track {
  id: number;
  label: string;
  score: number;
  box: Box;
  seenMs: number;
  hits: number;
  missed: number;
  coasting: boolean;
}

export interface Zone {
  name: string;
  points: Point[];
  label?: string;
}

export interface Line {
  name: string;
  from: Point;
  to: Point;
  label?: string;
}

export interface CameraRegions {
  zones: Zone[];
  lines: Line[];
}

export interface ZoneReading {
  name: string;
  count: number;
  dwell: number;
  ids: number[];
}

export interface LineReading {
  name: string;
  in: number;
  out: number;
  recent: { id: number; direction: 'in' | 'out'; at: number }[];
}

export interface TrackingSnapshot {
  tracks: Track[];
  zones: ZoneReading[];
  lines: LineReading[];
}

export interface TrackerOptions {
  minHits: number;
  lostMs: number;
  maxMisses: number;
  maxTracks: number;
  maxDetections: number;
  gate: number;
}

export const TRACKER_DEFAULTS: TrackerOptions = {
  minHits: 2,
  lostMs: 1500,
  maxMisses: 30,
  maxTracks: 64,
  maxDetections: 64,
  gate: 0.15,
};

export const MAX_ZONES = 16;
export const MAX_LINES = 16;
export const MAX_ZONE_POINTS = 32;
