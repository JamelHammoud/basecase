import type { KeyboardEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrameLabelEditor from './FrameLabelEditor';
import LabelTools from './LabelTools';
import { useLabelEditor } from './useLabelEditor';
import { useLabelDrawing } from './useLabelDrawing';
import type { FrameLabelEditorProps } from './labelEditorTypes';

vi.mock('./useLabelEditor', () => ({ useLabelEditor: vi.fn() }));
vi.mock('./useLabelDrawing', () => ({ useLabelDrawing: vi.fn() }));

const editor = {
  tool: 'polygon',
  setTool: vi.fn(),
  set: { frames: [], classes: [] },
} as unknown as ReturnType<typeof useLabelEditor>;
const drawing = {
  points: [[1, 1]],
  reset: vi.fn(),
  finish: vi.fn(),
} as unknown as ReturnType<typeof useLabelDrawing>;
const props = {} as FrameLabelEditorProps;

function keyboard(key: string, button = false): KeyboardEvent {
  return {
    key,
    target: { closest: (selector: string) => (button && selector === 'button' ? {} : null) },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

function surface() {
  return FrameLabelEditor(props).props.children;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useLabelEditor).mockReturnValue(editor);
  vi.mocked(useLabelDrawing).mockReturnValue(drawing);
});

describe('frame label editor controls', () => {
  it('discards an unfinished polygon when choosing a tool in the toolbar', () => {
    const toolbar = surface().props.children[0].props.children[0];
    const tools = LabelTools(toolbar.props).props.children[0];
    const box = tools.find((tool: { props: { title: string } }) => tool.props.title === 'Draw box');

    box.props.onClick();
    expect(drawing.reset).toHaveBeenCalledOnce();
    expect(editor.setTool).toHaveBeenCalledWith('box');
    expect(vi.mocked(drawing.reset).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(editor.setTool).mock.invocationCallOrder[0],
    );
  });

  it('leaves Enter available to a focused button without finishing the current polygon', () => {
    const event = keyboard('Enter', true);

    surface().props.onKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(drawing.finish).not.toHaveBeenCalled();
  });

  it('finishes the polygon when Enter is pressed on the canvas', () => {
    const event = keyboard('Enter');

    surface().props.onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(drawing.finish).toHaveBeenCalledOnce();
  });

  it('clears the draft before choosing a tool with its shortcut', () => {
    surface().props.onKeyDown(keyboard('b'));
    expect(drawing.reset).toHaveBeenCalledOnce();
    expect(editor.setTool).toHaveBeenCalledWith('box');
  });
});
