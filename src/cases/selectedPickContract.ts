import type { Formula, State } from '../skills/contract';

const HOLD_S = 0.2;
const RELEASE_HOLD_S = 0.3;
const PLACEMENT_SLACK_MM = 4;

const contact = (signal: string, present: boolean): State => ({
  atom: { expr: { signal }, cmp: present ? '>' : '<', value: 0.5, scale: 1 },
});

export function selectedPickContract(heightMm: number, radiusMm: number): Formula {
  const lift = Math.max(4, heightMm / 2);
  const raised: State = {
    atom: { expr: { delta: { signal: 'lift' } }, cmp: '>', value: lift, scale: lift },
  };
  const placed: State = {
    all: [
      { atom: { expr: { signal: 'spot' }, cmp: '<', value: radiusMm, scale: radiusMm } },
      {
        atom: {
          expr: { abs: { delta: { signal: 'lift' } } },
          cmp: '<',
          value: PLACEMENT_SLACK_MM,
          scale: lift,
        },
      },
    ],
  };

  return {
    sequence: [
      { hold_for: { seconds: HOLD_S, within: 'whole', state: { all: [contact('grip', true), raised] } } },
      {
        all: [
          { always: { window: 'whole', state: { any: [contact('grip', true), placed] } } },
          {
            always: {
              window: { last: RELEASE_HOLD_S },
              state: { all: [placed, contact('contact', false)] },
            },
          },
        ],
      },
    ],
  };
}
