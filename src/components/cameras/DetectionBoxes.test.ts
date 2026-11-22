import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetectionBoxes } from './DetectionBoxes';
import { RegionShapes } from './RegionShapes';
import type { VisionResult } from '../../vision/types';

const result = {
  modelId: 'objects',
  camera: 'wrist',
  timestamp: 0,
  width: 640,
  height: 480,
  detections: [{ label: 'Block', score: 0.91, box: [0.1, 0.2, 0.3, 0.4] }],
} as VisionResult;

describe('camera detection overlay', () => {
  it('places labeled normalized boxes in a separate DOM layer without touching the camera canvas', () => {
    const html = renderToStaticMarkup(React.createElement(DetectionBoxes, { result }));

    expect(html).toContain('data-testid="vision-box"');
    expect(html).toContain('left:10%');
    expect(html).toContain('top:20%');
    expect(html).toContain('width:30%');
    expect(html).toContain('height:40%');
    expect(html).toContain('Block 91%');
    expect(html).not.toContain('<canvas');
  });
});

describe('tracked camera overlay', () => {
  const tracked = {
    ...result,
    tracking: {
      tracks: [
        {
          id: 7,
          label: 'Block',
          score: 0.91,
          box: [0.1, 0.2, 0.3, 0.4],
          seenMs: 0,
          hits: 3,
          missed: 0,
          coasting: false,
        },
      ],
      zones: [{ name: 'bin', count: 1, dwell: 2, ids: [7] }],
      lines: [{ name: 'gate', in: 3, out: 1, recent: [] }],
    },
  } as VisionResult;
  const regions = {
    zones: [
      {
        name: 'bin',
        points: [
          [0, 0],
          [1, 0],
          [1, 1],
        ] as [number, number][],
      },
    ],
    lines: [{ name: 'gate', from: [0.5, 1] as [number, number], to: [0.5, 0] as [number, number] }],
  };

  it('writes each box’s track id only when the camera has zones or lines', () => {
    const plain = renderToStaticMarkup(React.createElement(DetectionBoxes, { result: tracked }));
    const ids = renderToStaticMarkup(React.createElement(DetectionBoxes, { result: tracked, ids: true }));

    expect(plain).not.toContain('#7');
    expect(ids).toContain('Block #7 91%');
    expect(ids).toContain('data-track="7"');
  });

  it('draws each zone and line with its live count as an SVG layer beside the boxes', () => {
    const html = renderToStaticMarkup(React.createElement(RegionShapes, { regions, tracking: tracked.tracking }));

    expect(html).toContain('data-testid="vision-zone"');
    expect(html).toContain('data-count="1"');
    expect(html).toContain('data-in="3"');
    expect(html).toContain('data-out="1"');
    expect(html).toContain('bin 1');
    expect(html).toContain('gate 3 in 1 out');
    expect(html).not.toContain('<canvas');
  });

  it('shows zero counts before the first tracked result', () => {
    const html = renderToStaticMarkup(React.createElement(RegionShapes, { regions }));

    expect(html).toContain('gate 0 in 0 out');
  });
});
