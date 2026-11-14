import type { Routine, SayStep } from './schema';

const say = (id: string, text: string, timeoutMs = 4000): SayStep => ({
  kind: 'say',
  id,
  text,
  timeoutMs,
  onTimeout: [],
  onFail: [],
});

export function greetingRoutine(): Routine {
  return {
    schema: 1,
    id: 'greeting',
    name: 'Greet People',
    sentence: 'Walk around. When you see someone, check their face and say hello, by name if you know them.',
    requires: ['camera', 'speaker', 'legs'],
    base: {
      kind: 'do',
      id: 'walk',
      skill: 'walk',
      holds: ['body'],
      timeoutMs: 300_000,
      onTimeout: [say('doneWalking', 'I’m done walking')],
      onFail: [],
    },
    watchers: [
      { id: 'obstacle', model: 'obstacle-near', rateHz: 10, maxAgeMs: 500, publishes: { type: 'boolean' } },
      { id: 'person', model: 'person-detection', rateHz: 10, maxAgeMs: 500, publishes: { type: 'boolean' } },
    ],
    reactions: [
      {
        id: 'avoid',
        when: { fact: 'obstacle', is: true },
        cooldownMs: 5000,
        onRetrigger: 'queue',
        body: 'stopFirst',
        steps: [
          say('excuseMe', 'Excuse me'),
          {
            kind: 'do',
            id: 'turnAway',
            skill: 'turn-away',
            holds: ['body'],
            timeoutMs: 6000,
            onTimeout: [],
            onFail: [say('stuck', 'I’m stuck')],
          },
        ],
      },
      {
        id: 'greet',
        when: { fact: 'person', is: true },
        cooldownMs: 15_000,
        onRetrigger: 'ignore',
        body: 'keepGoing',
        steps: [
          {
            kind: 'infer',
            id: 'recognize',
            model: 'face-recognition',
            input: 'camera',
            output: { type: 'identity' },
            timeoutMs: 3000,
            onTimeout: [say('helloAfterTimeout', 'Hello')],
            onFail: [say('helloAfterFail', 'Hello')],
          },
          {
            kind: 'if',
            id: 'known',
            test: { fact: 'recognize', atLeast: 0.6 },
            then: [
              {
                kind: 'together',
                id: 'greetByName',
                join: 'all',
                branches: [
                  [
                    {
                      kind: 'do',
                      id: 'lookAt',
                      skill: 'look-at',
                      holds: ['head'],
                      timeoutMs: 2000,
                      onTimeout: [],
                      onFail: [],
                    },
                  ],
                  [say('helloName', 'Hello {name}')],
                ],
              },
            ],
            else: [say('hello', 'Hello')],
          },
          {
            kind: 'ask',
            id: 'ask',
            prompt: 'Does this person want to talk?',
            input: 'camera',
            answers: ['yes', 'no'],
            timeoutMs: 30_000,
            onTimeout: [],
            onFail: [],
          },
          {
            kind: 'if',
            id: 'wantsToTalk',
            test: { fact: 'ask', is: 'yes' },
            then: [say('offerHelp', 'How can I help?')],
            else: [],
          },
        ],
      },
    ],
    safeStop: 'settle',
  };
}
