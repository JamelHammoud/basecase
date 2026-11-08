import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { partQuote } from './partQuote';

describe('partQuote', () => {
  it('names the part and gives the agent its id and position', () => {
    const part = { id: 'p1', name: 'Shoulder Servo', position: [10.04, 0, 25.55] } as ScenePart;

    expect(partQuote(part)).toEqual({
      id: 'part:p1',
      source: 'the scene',
      text: 'Shoulder Servo',
      context: 'Part: p1\nPosition (mm): 10, 0, 25.6',
    });
  });
});
