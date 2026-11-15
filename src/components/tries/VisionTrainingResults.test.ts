import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VisionTrainingResults } from './VisionTrainingResults';
import type { VisionAttemptView } from './visionTrainingView';

const attempt: VisionAttemptView = {
  id: 'candidate-1',
  at: '2026-11-15T12:00:00Z',
  retained: true,
  reason: 'Improved held-out accuracy',
  metrics: [{ name: 'mAP', value: '82%' }],
  failures: [{ className: 'Cup', missed: 3, falsePositives: 1 }],
  inferenceMs: 12.5,
  bytes: 1048576,
};

describe('vision training comparison', () => {
  it('keeps the metrics, per-class failures and inference cost beside each attempt', () => {
    const html = renderToStaticMarkup(
      createElement(VisionTrainingResults, {
        attempts: [attempt, { ...attempt, id: 'candidate-2', retained: false, reason: 'Accuracy decreased' }],
        targets: [{ id: 'camera:objects', name: 'Scene / See Objects' }],
        onApply: () => {},
      }),
    );

    expect(html).toContain('82%');
    expect(html).toContain('mAP');
    expect(html).toContain('Cup');
    expect(html).toContain('3 misses');
    expect(html).toContain('1 false positive');
    expect(html).toContain('12.5 ms');
    expect(html).toContain('1 MB');
    expect(html).toContain('Retained');
    expect(html).toContain('Accuracy decreased');
    expect(html.match(/Apply Model/g)).toHaveLength(1);
  });

  it('adds no result controls before an attempt finishes', () => {
    expect(
      renderToStaticMarkup(createElement(VisionTrainingResults, { attempts: [], targets: [], onApply: () => {} })),
    ).toBe('');
  });

  it('keeps older retained versions selectable with their own compatible destinations', () => {
    const html = renderToStaticMarkup(
      createElement(VisionTrainingResults, {
        attempts: [
          { ...attempt, active: false, targets: [{ id: 'camera:person', name: 'Scene: See Person' }] },
          {
            ...attempt,
            id: 'segment-2',
            active: true,
            targets: [{ id: 'camera:objects', name: 'Scene: See Objects' }],
          },
        ],
        targets: [],
        onApply: () => {},
      }),
    );
    const oldRow = html.slice(html.indexOf('data-attempt="candidate-1"'), html.indexOf('data-attempt="segment-2"'));
    const latestRow = html.slice(html.indexOf('data-attempt="segment-2"'));

    expect(html.match(/Apply Model/g)).toHaveLength(2);
    expect(oldRow).toContain('Scene: See Person');
    expect(latestRow).toContain('Scene: See Objects');
    expect(latestRow).not.toContain('Scene: See Person');
  });
});
