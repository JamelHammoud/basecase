import { describe, expect, it } from 'vitest';
import type { Routine, Step } from '../routines/schema';
import { uniqueWords, voiceWordsOf } from './voiceWords';

const guard = { timeoutMs: 1000, onTimeout: [], onFail: [] };
const settle: Step = { kind: 'do', skill: 'settle', holds: ['body'], ...guard };

function routine(): Routine {
  return {
    schema: 1,
    id: 'commands',
    name: 'Commands',
    requires: ['legs'],
    base: { kind: 'do', id: 'start', skill: 'settle', holds: ['body'], ...guard },
    watchers: [
      { id: 'voice', model: 'live-input', rateHz: 20, maxAgeMs: 300, publishes: { type: 'text' } },
      {
        id: 'person',
        model: 'person-detector',
        rateHz: 10,
        maxAgeMs: 300,
        publishes: { type: 'boolean' },
        when: { fact: 'voice', is: 'look' },
      },
    ],
    reactions: [
      {
        id: 'sit',
        when: { fact: 'voice', is: 'sit' },
        cooldownMs: 0,
        onRetrigger: 'ignore',
        body: 'stopFirst',
        steps: [],
      },
      {
        id: 'stay',
        when: { all: [{ fact: 'person', is: true }, { not: { fact: 'voice', is: 'Stay' } }] },
        cooldownMs: 0,
        onRetrigger: 'ignore',
        body: 'stopFirst',
        steps: [
          {
            kind: 'if',
            test: {
              any: [
                { fact: 'voice', is: 'heel' },
                { fact: 'phone', is: 'down' },
              ],
            },
            then: [{ kind: 'wait', until: { fact: 'voice', is: 'go' }, ...guard }],
            else: [settle],
          },
        ],
      },
      {
        id: 'others',
        when: {
          any: [
            { fact: 'voice', is: 'SIT' },
            { fact: 'voice', is: 3 },
            { fact: 'voice', atLeast: 1 },
          ],
        },
        cooldownMs: 0,
        onRetrigger: 'ignore',
        body: 'stopFirst',
        steps: [{ kind: 'wait', until: { fact: 'voice', is: 'sit down' }, ...guard }],
      },
    ],
    safeStop: 'settle',
  };
}

describe('voice words', () => {
  it('collects every word the logic compares the voice fact against', () => {
    expect(voiceWordsOf(routine())).toEqual(['look', 'sit', 'Stay', 'heel', 'go']);
  });

  it('is empty without logic or without voice conditions', () => {
    expect(voiceWordsOf(undefined)).toEqual([]);
    expect(voiceWordsOf({ ...routine(), watchers: [], reactions: [] })).toEqual([]);
  });

  it('keeps one single word per spelling, trimmed', () => {
    expect(uniqueWords([' sit ', 'Sit', 'stand up', '', '3', "don't", 'stand'])).toEqual(['sit', "don't", 'stand']);
  });
});
