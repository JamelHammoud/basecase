import { expect, it, vi } from 'vitest';
import { cameraFeedOwners } from './cameraFeedOwners';

it('releases only its simulation link and restores a surviving producer when the current one leaves', () => {
  const feeds = cameraFeedOwners();
  const connect = vi.fn();
  const hidden = vi.fn<() => MessagePort>();
  const visible = vi.fn<() => MessagePort>();
  const releaseHidden = feeds.connect({}, connect, hidden);
  const releaseVisible = feeds.connect({}, connect, visible);

  expect(connect).toHaveBeenLastCalledWith(visible);
  releaseHidden();
  expect(connect).toHaveBeenCalledTimes(2);
  releaseVisible();
  expect(connect).toHaveBeenLastCalledWith(null);

  const releaseFirst = feeds.connect({}, connect, hidden);
  const releaseSecond = feeds.connect({}, connect, visible);

  releaseSecond();
  expect(connect).toHaveBeenLastCalledWith(hidden);
  releaseFirst();
  expect(connect).toHaveBeenLastCalledWith(null);
});

it('requires every requested camera and retains overlapping producers until their last owner leaves', () => {
  const feeds = cameraFeedOwners();
  const changed = vi.fn();
  const unsubscribe = feeds.subscribe(changed);
  const releaseStrip = feeds.register({}, ['scene', 'wrist']);
  const releaseStream = feeds.register({}, ['wrist']);

  expect(feeds.covers([])).toBe(false);
  expect(feeds.covers(['scene', 'wrist'])).toBe(true);
  expect(feeds.covers(['scene', 'overhead'])).toBe(false);
  releaseStrip();
  expect(feeds.covers(['scene', 'wrist'])).toBe(false);
  expect(feeds.covers(['wrist'])).toBe(true);
  releaseStream();
  expect(feeds.covers(['wrist'])).toBe(false);
  expect(changed).toHaveBeenCalledTimes(4);
  unsubscribe();
  feeds.register({}, ['scene'])();
  expect(changed).toHaveBeenCalledTimes(4);
});

it('keeps camera producer coverage isolated between scene sources', () => {
  const first = cameraFeedOwners();
  const replacement = cameraFeedOwners();
  const release = first.register({}, ['wrist']);

  expect(first.covers(['wrist'])).toBe(true);
  expect(replacement.covers(['wrist'])).toBe(false);
  release();
  expect(first.covers(['wrist'])).toBe(false);
});
