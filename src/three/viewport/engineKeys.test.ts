import { describe, expect, it } from 'vitest';
import { shownPropsChanged, steadyProps } from './engineKeys';
import type { AgentFrame, ViewportProps } from './types';

const NONE: string[] = [];
const props = (over: Partial<ViewportProps>) => ({ selectedPartIds: NONE, ...over }) as unknown as ViewportProps;
const frame = (partIds: string[]): AgentFrame => ({ key: 'call-1', color: '#0d99ff', partIds, emphasis: 'normal' });

describe('steadyProps', () => {
  it('keeps the shown agent frames when a re-render rebuilds the same frames', () => {
    const shown = [frame(['arm'])];
    const next = steadyProps(props({ agentFrames: shown }), props({ agentFrames: [frame(['arm'])] }));

    expect(next.agentFrames).toBe(shown);
  });

  it('takes new agent frames when a frame covers other parts', () => {
    const moved = [frame(['wrist'])];

    expect(steadyProps(props({ agentFrames: [frame(['arm'])] }), props({ agentFrames: moved })).agentFrames).toBe(
      moved,
    );
  });
});

describe('shownPropsChanged', () => {
  it('ignores callbacks that only changed identity', () => {
    const parts: ViewportProps['parts'] = [];

    expect(shownPropsChanged(props({ parts, onSelectPart: () => {} }), props({ parts, onSelectPart: () => {} }))).toBe(
      false,
    );
  });

  it('sees a callback arriving or leaving, and any changed value', () => {
    const parts: ViewportProps['parts'] = [];

    expect(shownPropsChanged(props({ parts, onGrab: null }), props({ parts, onGrab: () => {} }))).toBe(true);
    expect(shownPropsChanged(props({ parts }), props({ parts: [] }))).toBe(true);
    expect(shownPropsChanged(props({ parts, showGrid: true }), props({ parts, showGrid: false }))).toBe(true);
  });
});
