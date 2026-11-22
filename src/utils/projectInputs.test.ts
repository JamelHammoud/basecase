import { expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { sameProjectInputs, sameProjectSnapshot } from './projectInputs';

const guide = { fingerprint: 'guide' } as ProjectSettings['buildGuide'];

it('ignores generated guide and body evidence when comparing project inputs', () => {
  expect(sameProjectInputs(DEFAULT_PROJECT, { ...DEFAULT_PROJECT, buildGuide: guide })).toBe(true);
  expect(sameProjectInputs(DEFAULT_PROJECT, { ...DEFAULT_PROJECT, bodyEvidence: [] })).toBe(true);
  expect(sameProjectInputs(DEFAULT_PROJECT, { ...DEFAULT_PROJECT, material: 'ABS' })).toBe(false);
});

it('keeps a project snapshot across generated metadata only', () => {
  expect(sameProjectSnapshot(DEFAULT_PROJECT, DEFAULT_PROJECT)).toBe(true);
  expect(sameProjectSnapshot(DEFAULT_PROJECT, { ...DEFAULT_PROJECT, buildGuide: guide })).toBe(true);
  expect(sameProjectSnapshot(DEFAULT_PROJECT, { ...DEFAULT_PROJECT, bodyEvidence: [] })).toBe(true);
});

it('rejects physical edits, simultaneous generated changes and plain clones', () => {
  expect(sameProjectSnapshot(DEFAULT_PROJECT, { ...DEFAULT_PROJECT, material: 'ABS' })).toBe(false);
  expect(sameProjectSnapshot(DEFAULT_PROJECT, { ...DEFAULT_PROJECT, buildGuide: guide, material: 'ABS' })).toBe(false);
  expect(sameProjectSnapshot(DEFAULT_PROJECT, { ...DEFAULT_PROJECT })).toBe(false);
});
