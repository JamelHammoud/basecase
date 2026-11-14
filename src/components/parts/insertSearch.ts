import { sourcedItems, type SourcedItem } from '../../data/sourcedItems';
import type { CatalogItem } from '../../types/robotics';
import { OBJECT_CATEGORIES, type ObjectCategory } from '../objects/objectCategories';
import { matchesAll, parseSizeQuery, scoreCatalog, scoreEntry, wordMatcher, type Scorable } from './catalogSearch';
import { robotEntries, type RobotEntry, type RobotGroup } from './robotEntries';

export type Hit =
  | { kind: 'part'; item: CatalogItem }
  | { kind: 'robot'; robot: RobotEntry }
  | { kind: 'objects'; category: ObjectCategory };

const ROBOT_WORDS = ['robot', 'humanoid', 'biped', 'quadruped', 'arm', 'manipulator', 'legged'];

const GROUP_WORDS: Record<RobotGroup, string> = {
  Imported: 'imported',
  Humanoids: 'humanoid biped legged',
  'Small bipeds': 'small biped humanoid legged',
  Quadrupeds: 'quadruped dog legged',
  Arms: 'arm manipulator',
};

const NAMED_ROBOT_BONUS = 20;
const WHOLE_ROBOT_EDGE = 0.5;
const OBJECT_WORD_SCORE = 5;

const wordsOf = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const objectWords = (c: ObjectCategory) => wordsOf(`${c.title} ${c.examples}`);

const sameWord = (w: string, known: string) =>
  known === w || known === `${w}s` || known === `${w}es` || w === `${known}s`;

const names = (known: string[]) => (w: string) => known.some((k) => sameWord(w, k));

const robotIndex = (r: RobotEntry): Scorable => {
  const group = `robot robots ${r.group} ${GROUP_WORDS[r.group]}`.toLowerCase();
  const { title, maker, description, url } = r.preset;

  return {
    name: title.toLowerCase(),
    group,
    text: [title, maker, description, r.imported ? url : '', group].join(' ').toLowerCase(),
  };
};

interface Scored {
  hit: Hit;
  score: number;
}

function robotHits(robots: RobotEntry[], words: string[]): Scored[] {
  const matchers = words.map(wordMatcher);
  const q = words.join(' ');
  const bonus = words.some(names(ROBOT_WORDS)) ? NAMED_ROBOT_BONUS : 0;

  return robots
    .map((robot, i) => ({ robot, e: robotIndex(robot), i }))
    .filter(({ e }) => matchesAll(e, matchers))
    .map(({ robot, e, i }) => ({
      hit: { kind: 'robot', robot },
      score: scoreEntry(e, q, matchers) + bonus + WHOLE_ROBOT_EDGE - i / 1000,
    }));
}

const objectHits = (words: string[]): Scored[] =>
  OBJECT_CATEGORIES.filter((c) => words.every(names(objectWords(c)))).map((category, i) => ({
    hit: { kind: 'objects', category },
    score: OBJECT_WORD_SCORE * words.length - i / 1000,
  }));

export interface InsertSources {
  sourced?: SourcedItem[];
  robots?: RobotEntry[];
}

export function searchInsertables(query: string, sources: InsertSources = {}): Hit[] {
  const { sourced = sourcedItems(), robots = robotEntries([]) } = sources;
  const parts = scoreCatalog(query, sourced);
  const partHits: Scored[] = parts.hits.map(({ item, score }) => ({ hit: { kind: 'part', item }, score }));

  if (parts.sized) return partHits.map((s) => s.hit);

  const { words } = parseSizeQuery(query.trim());

  if (!words.length) return [];

  return [...partHits, ...robotHits(robots, words), ...objectHits(words)]
    .sort((a, b) => b.score - a.score)
    .map((s) => s.hit);
}
