import type { SceneMark, ScenePart } from '../types/robotics';
import { markColorName, markColorOf } from '../utils/markColors';
import { toCad } from './agentFrame';

const MAX_LISTED = 8;
const MAX_NAMED = 4;

const plural = (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`;

function cadBounds(points: SceneMark['points']) {
  const cad = points.map(toCad);
  const axis = (k: number, pick: (...v: number[]) => number) => Math.round(pick(...cad.map((p) => p[k])));

  return {
    min: [0, 1, 2].map((k) => axis(k, Math.min)),
    max: [0, 1, 2].map((k) => axis(k, Math.max)),
  };
}

export function describeMarks(marks: SceneMark[] | undefined, parts: ScenePart[]) {
  const names = new Map(parts.map((p) => [p.id, p.name]));

  return (marks ?? []).map((mark) => ({
    id: mark.id,
    color: markColorName(markColorOf(mark)),
    ...(mark.label ? { label: mark.label } : {}),
    around: mark.partIds.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id) })),
    bounds: cadBounds(mark.points),
    ...(mark.view ? { seenFrom: mark.view } : {}),
  }));
}

function markPhrase(mark: SceneMark, names: Map<string, string>): string {
  const marked = mark.partIds.flatMap((id) => names.get(id) ?? []);
  const listed = marked.slice(0, MAX_NAMED).join(', ');
  const more = marked.length > MAX_NAMED ? ` and ${marked.length - MAX_NAMED} more` : '';
  const around = marked.length ? ` around ${listed}${more}` : '';
  const label = mark.label ? `, labelled "${mark.label}"` : '';

  return `${markColorName(markColorOf(mark))}${around}${label}`;
}

export function marksNote(marks: SceneMark[] | undefined, parts: ScenePart[]): string {
  if (!marks?.length) return '';

  const names = new Map(parts.map((p) => [p.id, p.name]));
  const listed = marks.slice(0, MAX_LISTED).map((m) => markPhrase(m, names));
  const more = marks.length > MAX_LISTED ? `; and ${marks.length - MAX_LISTED} more` : '';

  return `[The user drew ${plural(marks.length)} on the canvas: ${listed.join('; ')}${more}. Each colour and label says what the user means by that mark. get_scene lists them under "marks"; look renders show them with their labels, and look with a mark's "seenFrom" view shows it as the user drew it. They point at what this message is about; they aren't geometry.]`;
}
