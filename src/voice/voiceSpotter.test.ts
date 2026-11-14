import { describe, expect, it } from 'vitest';
import { spotWords, voiceGrammar, VOICE_CONFIDENCE } from './voiceSpotter';

const words = ['sit', 'Stand'];
const heard = (...pairs: [string, number][]) => ({ result: pairs.map(([word, conf]) => ({ word, conf })) });

describe('voice spotter', () => {
  it('builds a lower-case grammar that ends in the unknown word', () => {
    expect(voiceGrammar(words)).toBe('["sit","stand","[unk]"]');
  });

  it('spots listed words at or above the confidence, once per result, as the logic spells them', () => {
    expect(spotWords(heard(['sit', 1], ['stand', 1], ['sit', 0.9]), words)).toEqual(['sit', 'Stand']);
    expect(spotWords(heard(['[unk]', 1], ['sit', 0.872]), words)).toEqual(['sit']);
    expect(spotWords(heard(['sit', VOICE_CONFIDENCE]), words)).toEqual(['sit']);
  });

  it('drops unsure words, unknown words and partial results', () => {
    expect(spotWords(heard(['sit', 0.629], ['sit', 0.41]), words)).toEqual([]);
    expect(spotWords(heard(['[unk]', 1]), words)).toEqual([]);
    expect(spotWords({ text: '' }, words)).toEqual([]);
    expect(spotWords({ partial: 'sit' } as never, words)).toEqual([]);
  });
});
