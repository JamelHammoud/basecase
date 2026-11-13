import { similarTitle } from './titles.mjs';

const DEPENDS = /Depends on\*{0,2}([^\n]*)/gi;
const QUOTED = /"([^"]+)"/g;

const plain = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function dependencies(body) {
  return [...String(body ?? '').matchAll(DEPENDS)].flatMap((match) =>
    [...match[1].split('(')[0].matchAll(QUOTED)].map((quoted) => quoted[1]),
  );
}

const names = (title, dependency) => plain(title).startsWith(plain(dependency)) || similarTitle(title, dependency);

export const waitsOn = (step, openSteps) =>
  dependencies(step.body).some((dependency) =>
    openSteps.some((other) => other.number !== step.number && names(other.title, dependency)),
  );
