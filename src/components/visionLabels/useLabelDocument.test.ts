import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { FrameSet } from '../../vision/frameSet';
import { useLabelDocument } from './useLabelDocument';

it('publishes the exact predecessor for consecutive edits, class creation, undo and redo before rendering again', () => {
  const original: FrameSet = {
    version: 1,
    id: 'set',
    name: 'Frames',
    caseId: null,
    sceneId: null,
    seed: 1,
    createdAt: 'now',
    classes: [{ id: 0, name: 'Cup' }],
    frames: [],
  };
  const onChange = vi.fn();
  const mounted: { editor?: ReturnType<typeof useLabelDocument> } = {};

  function Harness() {
    mounted.editor = useLabelDocument({ set: original, onChange, onClose: vi.fn() });

    return null;
  }

  renderToString(createElement(Harness));

  const editor = mounted.editor;

  if (!editor) throw new Error('Expected a mounted label document.');

  editor.renameClass('Mug');
  editor.addClass('Bottle');
  editor.undo();
  editor.redo();

  const [renamed, added, undone, redone] = onChange.mock.calls;

  expect(renamed[1]).toBe(original);
  expect(renamed[0].classes.map((category: { name: string }) => category.name)).toEqual(['Mug']);
  expect(added[1]).toBe(renamed[0]);
  expect(added[0].classes.map((category: { name: string }) => category.name)).toEqual(['Mug', 'Bottle']);
  expect(undone).toEqual([renamed[0], added[0]]);
  expect(redone).toEqual([added[0], renamed[0]]);
  expect(editor.currentSet()).toBe(redone[0]);
});
