import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetectionBoxes } from './DetectionBoxes';
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
