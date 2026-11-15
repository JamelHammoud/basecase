import { describe, expect, it } from 'vitest';
import { labelKeyAction } from './labelKeys';
import { IS_MAC } from '../../utils/os';

const key = (value: string, extra = {}) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});

describe('frame label shortcuts', () => {
  it('navigates frames and selects tools without stealing modified keys', () => {
    expect(labelKeyAction(key('ArrowRight'))).toBe('next');
    expect(labelKeyAction(key('ArrowLeft'))).toBe('previous');
    expect(labelKeyAction(key('b'))).toBe('box');
    expect(labelKeyAction(key('p'))).toBe('polygon');
    expect(labelKeyAction(key('k'))).toBe('keypoint');
    expect(labelKeyAction(key('Enter'))).toBe('finish');
    expect(labelKeyAction(key('b', { altKey: true }))).toBeNull();
    expect(labelKeyAction(key('z', { metaKey: IS_MAC, ctrlKey: !IS_MAC }))).toBe('undo');
    expect(labelKeyAction(key('z', { metaKey: IS_MAC, ctrlKey: !IS_MAC, shiftKey: true }))).toBe('redo');
  });
});
