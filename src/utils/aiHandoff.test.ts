import { describe, expect, it } from 'vitest';
import { buildAIHandoffPayload } from './aiHandoff';

const intentSection = (markdown: string) => {
  const lines = markdown.split('\n');
  const start = lines.indexOf('## 1. High-Level Design Intent');

  return lines.slice(start + 1, start + 3);
};

describe('buildAIHandoffPayload', () => {
  it('puts the scene description under the design intent', () => {
    const { markdown } = buildAIHandoffPayload('Rover', 'Four-wheel rover that climbs a 20 mm step', []);

    expect(intentSection(markdown)).toEqual(['Four-wheel rover that climbs a 20 mm step', '']);
  });

  it('goes straight to the envelope when the scene has no description', () => {
    const { markdown } = buildAIHandoffPayload('Rover', '', []);

    expect(intentSection(markdown)[0]).toMatch(/^- \*\*Overall Envelope/);
    expect(markdown).not.toContain('No global note');
  });
});
