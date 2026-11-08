import { describe, expect, it } from 'vitest';
import { filterSlash, parseSlash, SLASH_COMMANDS, slashQuery, slashText, stepSlash, withSlash } from './slashCommands';

describe('slash commands', () => {
  it('opens only for a slash at the very start, before any space', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/tr')).toBe('tr');
    expect(slashQuery('/TR')).toBe('tr');
    expect(slashQuery('/train ')).toBeNull();
    expect(slashQuery(' /train')).toBeNull();
    expect(slashQuery('train')).toBeNull();
    expect(slashQuery('a /train')).toBeNull();
    expect(slashQuery('/train\nwalk')).toBeNull();
  });

  it('lists every command for a bare slash and filters by name, prefixes first', () => {
    expect(filterSlash('').map((c) => c.name)).toEqual(SLASH_COMMANDS.map((c) => c.name));
    expect(filterSlash('c').map((c) => c.name)).toEqual(['case', 'check']);
    expect(filterSlash('ch').map((c) => c.name)).toEqual(['check']);
    expect(filterSlash('in').map((c) => c.name)).toEqual(['train', 'routine']);
    expect(filterSlash('zz')).toEqual([]);
  });

  it('inserts the command with a trailing space', () => {
    expect(slashText('train')).toBe('/train ');
  });

  it('puts a picked command in front of the draft, replacing a typed or earlier command', () => {
    expect(withSlash('', 'train')).toBe('/train ');
    expect(withSlash('/tr', 'train')).toBe('/train ');
    expect(withSlash('walk to the box', 'train')).toBe('/train walk to the box');
    expect(withSlash('/case reach the shelf', 'routine')).toBe('/routine reach the shelf');
  });

  it('reads a command and its goal from a message', () => {
    expect(parseSlash('/train walk to the box')).toEqual({ command: 'train', rest: 'walk to the box' });
    expect(parseSlash('/case ')).toEqual({ command: 'case', rest: '' });
    expect(parseSlash('/nope do it')).toBeNull();
    expect(parseSlash('train walk')).toBeNull();
  });

  it('wraps the highlight at both ends', () => {
    expect(stepSlash(0, -1, 5)).toBe(4);
    expect(stepSlash(4, 1, 5)).toBe(0);
    expect(stepSlash(2, 1, 0)).toBe(0);
  });
});
