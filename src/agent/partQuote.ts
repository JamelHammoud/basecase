import type { MessageQuote, ScenePart } from '../types/robotics';

const mm = (v: number) => Math.round(v * 10) / 10;

export function partQuote(part: ScenePart): MessageQuote {
  return {
    id: `part:${part.id}`,
    source: 'the scene',
    text: part.name,
    context: [`Part: ${part.id}`, `Position (mm): ${part.position.map(mm).join(', ')}`].join('\n'),
  };
}
