import { IDLE_S } from '../../datasets/segmentFrames';
import type { FlagKind, TryFlag } from '../../datasets/tryFlags';
import { runClock } from '../../utils/duration';

const FLAG_WORDS: Record<FlagKind, string> = {
  limit: 'Joint limit',
  gap: 'Frame gap',
  effort: 'Effort at the servo’s limit',
  idle: `Idle over ${IDLE_S} s`,
  model: 'Model changed',
};

const SHOWN_TIMES = 4;

function timesText(times: number[]) {
  const shown = times.slice(0, SHOWN_TIMES).map(runClock).join(', ');

  return times.length > SHOWN_TIMES ? `${shown}…` : shown;
}

export function flagLines(flags: TryFlag[], jointName: (id: string) => string = (id) => id): string[] {
  const groups = new Map<string, { flag: TryFlag; times: number[] }>();

  for (const flag of flags) {
    const key = `${flag.kind}:${flag.joint ?? ''}`;
    const group = groups.get(key) ?? { flag, times: [] };

    group.times.push(flag.at);
    groups.set(key, group);
  }

  return [...groups.values()].map(({ flag, times }) => {
    const what = flag.joint ? `${FLAG_WORDS[flag.kind]}: ${jointName(flag.joint)}` : FLAG_WORDS[flag.kind];

    return flag.kind === 'model' ? what : `${what} at ${timesText(times)}`;
  });
}

export const kindLines = (kinds: FlagKind[]) => kinds.map((k) => FLAG_WORDS[k]);
