import { describe, expect, it } from 'vitest';
import { titleCase } from './titleCase';

describe('titleCase', () => {
  it('capitalizes each word but articles, conjunctions and short prepositions', () => {
    expect(titleCase('range of motion')).toBe('Range of Motion');
    expect(titleCase('current and runtime')).toBe('Current and Runtime');
    expect(titleCase('heat near servos')).toBe('Heat near Servos');
    expect(titleCase('parts without a source')).toBe('Parts Without a Source');
  });

  it('capitalizes a short word that starts or ends the label', () => {
    expect(titleCase('to the flag')).toBe('To the Flag');
    expect(titleCase('compare with')).toBe('Compare With');
  });

  it('cases each part of a hyphenated word and keeps capitals already there', () => {
    expect(titleCase('hard-to-reach screws')).toBe('Hard-to-Reach Screws');
    expect(titleCase('LiDAR on IMU')).toBe('LiDAR on IMU');
  });
});
