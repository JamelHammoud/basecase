import { describe, expect, it } from 'vitest';
import type { WorkspaceMeta } from '../SceneWorkspace';
import {
  blankSeed,
  closedMessage,
  idsAfter,
  idsExcept,
  insertTab,
  moveTab,
  nextActiveAfterClose,
  tabListOf,
  type Metas,
  type TabEntry,
} from './tabModel';
import { tabCommandForKey, type TabKey } from './tabShortcuts';
import { tabsFromSeeds } from './openScenes';

const meta = (name: string, sceneId = name): WorkspaceMeta => ({
  sceneId,
  name,
  partCount: 0,
  busy: false,
  activity: '',
  chatId: null,
  chatIds: [],
  pristine: false,
});

const tabs: TabEntry[] = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('scene tabs', () => {
  it('names a blank scene after the open ones, ignoring closing tabs', () => {
    const metas: Metas = { a: meta('Untitled'), b: meta('Untitled 2'), c: meta('Robot') };

    expect(blankSeed(metas).sceneName).toBe('Untitled 3');
    expect(blankSeed(metas, ['a']).sceneName).toBe('Untitled');
    expect(blankSeed({}).blank).toBe(true);
  });

  it('activates the next tab to the right, then the left, after closing', () => {
    const close = (ids: string[], activeId: string) =>
      nextActiveAfterClose({ list: tabs, ids, activeId, remaining: tabs.filter((t) => !ids.includes(t.id)) });

    expect(close(['b'], 'b')).toBe('c');
    expect(close(['c', 'd'], 'd')).toBe('b');
    expect(close(['a'], 'c')).toBe('c');
    expect(
      nextActiveAfterClose({ list: tabs, ids: ['a', 'b', 'c', 'd'], activeId: 'a', remaining: [{ id: 'new' }] }),
    ).toBe('new');
  });

  it('inserts, moves and lists tabs', () => {
    expect(insertTab(tabs, { id: 'x' }, 2).map((t) => t.id)).toEqual(['a', 'b', 'x', 'c', 'd']);
    expect(insertTab(tabs, { id: 'x' }, 99).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'x']);
    expect(moveTab(tabs, 0, 2).map((t) => t.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(idsAfter(tabs, 'b')).toEqual(['c', 'd']);
    expect(idsExcept(tabs, 'b')).toEqual(['a', 'c', 'd']);
    expect(tabListOf([{ id: 'a' }, { id: 'b' }], { a: meta('Arm', 's1') })).toEqual([
      { id: 'a', name: 'Arm', sceneId: 's1' },
      { id: 'b', name: 'Untitled', sceneId: '' },
    ]);
  });

  it('words the close toast', () => {
    const seed = blankSeed({});

    expect(closedMessage([{ seed, index: 0 }], false)).toBe('Closed Untitled');
    expect(
      closedMessage(
        [
          { seed, index: 0 },
          { seed, index: 1 },
        ],
        true,
      ),
    ).toBe('Closed 2 scenes and stopped its agent');
  });
});

describe('tab shortcuts', () => {
  const ids = ['a', 'b', 'c'];
  const key = (k: Partial<TabKey>): TabKey => ({
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...k,
  });

  it('maps keys to tab commands', () => {
    expect(tabCommandForKey(key({ key: 'Tab', ctrlKey: true }), ids)).toBe('next-tab');
    expect(tabCommandForKey(key({ key: 'Tab', ctrlKey: true, shiftKey: true }), ids)).toBe('prev-tab');
    expect(tabCommandForKey(key({ key: '}', code: 'BracketRight', metaKey: true, shiftKey: true }), ids)).toBe(
      'next-tab',
    );
    expect(tabCommandForKey(key({ key: 't', metaKey: true }), ids)).toBe('new-scene');
    expect(tabCommandForKey(key({ key: 'T', metaKey: true, shiftKey: true }), ids)).toBe('reopen-tab');
    expect(tabCommandForKey(key({ key: 'w', metaKey: true }), ids)).toBe('close-tab');
    expect(tabCommandForKey(key({ key: 'o', metaKey: true }), ids)).toBe('open-scenes');
    expect(tabCommandForKey(key({ key: '2', metaKey: true }), ids)).toBe('tab:b');
    expect(tabCommandForKey(key({ key: '9', metaKey: true }), ids)).toBe('tab:c');
  });

  it('ignores keys that are not tab commands', () => {
    expect(tabCommandForKey(key({ key: 'w', metaKey: true, shiftKey: true }), ids)).toBeNull();
    expect(tabCommandForKey(key({ key: 't', metaKey: true, altKey: true }), ids)).toBeNull();
    expect(tabCommandForKey(key({ key: '5', metaKey: true }), ids)).toBeNull();
    expect(tabCommandForKey(key({ key: 't' }), ids)).toBeNull();
  });
});

describe('restoring open scenes', () => {
  const seed = (sceneId: string) => ({ ...blankSeed({}), sceneId, sceneName: sceneId, blank: undefined });

  it('reopens the saved scenes in order, the first as the main tab, and keeps the one in front', () => {
    const { tabs: restored, activeId } = tabsFromSeeds([seed('a'), null, seed('c')], 2);

    expect(restored.map((t) => t.seed?.sceneId)).toEqual(['a', 'c']);
    expect(restored[0].id).toBe('main');
    expect(activeId).toBe(restored[1].id);
  });

  it('keeps tab ids across a reload, so a running agent finds its tab again', () => {
    const { tabs: restored, activeId } = tabsFromSeeds([seed('a'), seed('b')], 1, ['tab-x', 'main']);

    expect(restored.map((t) => t.id)).toEqual(['tab-x', 'main']);
    expect(activeId).toBe('main');
  });

  it('starts with one blank scene when nothing could be restored', () => {
    const { tabs: restored, activeId } = tabsFromSeeds([null], 0);

    expect(restored).toHaveLength(1);
    expect(restored[0].seed?.blank).toBe(true);
    expect(activeId).toBe('main');
  });
});
