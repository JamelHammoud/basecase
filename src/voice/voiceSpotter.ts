export const VOICE_CONFIDENCE = 0.75;

export const UNKNOWN_WORD = '[unk]';

export interface VoskWord {
  word: string;
  conf: number;
  start?: number;
  end?: number;
}

export interface VoskResult {
  text?: string;
  result?: VoskWord[];
}

export const voiceGrammar = (words: readonly string[]) =>
  JSON.stringify([...words.map((word) => word.toLowerCase()), UNKNOWN_WORD]);

export function spotWords(result: VoskResult, words: readonly string[], confidence = VOICE_CONFIDENCE): string[] {
  const listed = new Map(words.map((word) => [word.toLowerCase(), word]));
  const spotted = new Set<string>();

  for (const heard of result.result ?? []) {
    const word = listed.get(heard.word.toLowerCase());

    if (word !== undefined && heard.conf >= confidence) spotted.add(word);
  }

  return [...spotted];
}
