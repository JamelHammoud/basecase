import { allSteps, type Condition, type Routine, type Step } from '../routines/schema';

export const VOICE_FACT = 'voice';

const ONE_WORD = /^\p{L}[\p{L}'-]*$/u;

function conditionWords(condition: Condition | undefined, found: string[]) {
  if (!condition) return;

  if ('all' in condition) return condition.all.forEach((part) => conditionWords(part, found));

  if ('any' in condition) return condition.any.forEach((part) => conditionWords(part, found));

  if ('not' in condition) return conditionWords(condition.not, found);

  if (condition.fact === VOICE_FACT && 'is' in condition && typeof condition.is === 'string') found.push(condition.is);
}

function stepCondition(step: Step): Condition | undefined {
  if (step.kind === 'if') return step.test;

  return step.kind === 'wait' ? step.until : undefined;
}

export function uniqueWords(words: readonly string[]): string[] {
  const seen = new Set<string>();

  return words
    .map((word) => word.trim())
    .filter((word) => ONE_WORD.test(word))
    .filter((word) => {
      const key = word.toLowerCase();
      const fresh = !seen.has(key);

      seen.add(key);

      return fresh;
    });
}

export function voiceWordsOf(routine: Routine | undefined): string[] {
  if (!routine) return [];

  const found: string[] = [];

  routine.watchers.forEach((watcher) => conditionWords(watcher.when, found));
  routine.reactions.forEach((reaction) => conditionWords(reaction.when, found));
  allSteps(routine).forEach((step) => conditionWords(stepCondition(step), found));

  return uniqueWords(found);
}
