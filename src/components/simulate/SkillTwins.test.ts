import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SkillTwins } from './SkillTwins';

describe('skill twin results', () => {
  it('keeps each unit’s pass count and failure beside its skill', () => {
    const html = renderToStaticMarkup(
      createElement(SkillTwins, {
        twins: {
          'arm-3': { unit: 'arm-3', passes: 4, trials: 32, passed: false, line: 'Shoulder sags' },
          'arm-1': { unit: 'arm-1', passes: 32, trials: 32, passed: true, line: '32 of 32 tries, at least 91%' },
        },
      }),
    );

    expect(html).toContain('arm-1');
    expect(html).toContain('32 of 32');
    expect(html).toContain('arm-3');
    expect(html).toContain('4 of 32');
    expect(html).toContain('Shoulder sags');
    expect(html.indexOf('arm-1')).toBeLessThan(html.indexOf('arm-3'));
  });

  it('adds no space before a skill has twin results', () => {
    expect(renderToStaticMarkup(createElement(SkillTwins, {}))).toBe('');
  });
});
