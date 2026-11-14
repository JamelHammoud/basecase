import type { Routine, RoutineError } from './schema';

const SCHEMA = 1;
const MAX_DEPTH = 8;
const MAX_STEPS = 512;
const MAX_LIST = 64;
const MAX_TEXT = 2000;
const ID = /^[A-Za-z][\w-]{0,63}$/;
const STEP_KINDS = new Set(['do', 'say', 'infer', 'ask', 'if', 'wait', 'together']);
const GUARDED_KINDS = new Set(['do', 'say', 'infer', 'ask', 'wait']);
const DATA_TYPES = new Set(['image', 'detections', 'pose', 'text', 'boolean', 'number', 'identity', 'faceEmbedding']);
const RESOURCES = new Set(['body', 'head', 'voice']);
const CAPABILITIES = new Set(['camera', 'microphone', 'speaker', 'legs', 'wheels', 'arms', 'head', 'depth']);
const KIND_LABEL: Record<string, string> = {
  do: 'Do',
  say: 'Say',
  infer: 'Check',
  ask: 'Ask',
  wait: 'Wait',
};

type Record_ = Record<string, unknown>;

const isRecord = (v: unknown): v is Record_ => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isList = (v: unknown, max = MAX_LIST): v is unknown[] => Array.isArray(v) && v.length <= max;

class Checker {
  errors: RoutineError[] = [];
  steps = 0;

  add(code: string, path: string, message: string) {
    if (this.errors.length < 100) this.errors.push({ code, path, message });
  }

  field(ok: boolean, path: string, message: string) {
    if (!ok) this.add('invalid-field', path, message);
  }
}

function checkLeaf(c: Checker, cond: Record_, path: string) {
  const tests = ['is', 'atLeast', 'atMost'].filter((k) => k in cond);

  c.field(isText(cond.fact, 64), `${path}.fact`, 'Name the fact this condition reads.');

  if (tests.length !== 1) {
    c.add('invalid-field', path, 'A condition compares with exactly one of is, atLeast or atMost.');

    return;
  }

  const value = cond[tests[0]];
  const valid = tests[0] === 'is' ? ['boolean', 'string'].includes(typeof value) || isNumber(value) : isNumber(value);

  c.field(valid, `${path}.${tests[0]}`, 'Compare with a number, a word or true or false.');
}

function checkGroup(c: Checker, items: unknown, path: string, depth: number) {
  if (!isList(items, 16) || items.length === 0) {
    c.add('invalid-field', path, 'A group needs between 1 and 16 conditions.');

    return;
  }

  items.forEach((item, i) => checkCondition(c, item, `${path}[${i}]`, depth + 1));
}

export function checkCondition(c: Checker, cond: unknown, path: string, depth = 0) {
  if (depth > MAX_DEPTH) {
    c.add('too-large', path, 'This condition nests too deeply.');

    return;
  }

  if (!isRecord(cond)) {
    c.add('invalid-field', path, 'A condition is an object.');

    return;
  }

  if ('all' in cond) return checkGroup(c, cond.all, `${path}.all`, depth);

  if ('any' in cond) return checkGroup(c, cond.any, `${path}.any`, depth);

  if ('not' in cond) return checkCondition(c, cond.not, `${path}.not`, depth + 1);

  checkLeaf(c, cond, path);
}

function checkGuard(c: Checker, step: Record_, path: string, depth: number) {
  const label = KIND_LABEL[String(step.kind)] ?? 'This step';
  const limit = step.timeoutMs;

  if (!isNumber(limit) || limit <= 0) c.add('missing-timeout', `${path}.timeoutMs`, `${label} needs a time limit.`);

  for (const key of ['onTimeout', 'onFail'] as const) {
    if (!Array.isArray(step[key])) {
      const what = key === 'onTimeout' ? 'runs out of time' : 'fails';

      c.add('missing-timeout', `${path}.${key}`, `Add what happens when ${label} ${what}.`);

      continue;
    }

    checkSteps(c, step[key], `${path}.${key}`, depth + 1);
  }
}

const MOTION_RANGES: Record<string, { min: number; max: number; message: string }> = {
  distance: { min: 0.01, max: 100, message: 'Drive between 0.01 and 100 m.' },
  speed: { min: 0.01, max: 2, message: 'Drive between 0.01 and 2 m/s.' },
  heading: { min: -180, max: 180, message: 'Head between −180° and 180°.' },
  turn: { min: -1080, max: 1080, message: 'Turn between −1080° and 1080°.' },
};

function checkMotion(c: Checker, move: unknown, path: string) {
  if (!isRecord(move)) return c.add('invalid-field', path, 'A move is an object.');

  for (const [key, value] of Object.entries(move)) {
    const range = MOTION_RANGES[key];
    const valid = !!range && isNumber(value) && value >= range.min && value <= range.max;

    c.field(valid, `${path}.${key}`, range?.message ?? 'A move has a distance, speed, heading or turn.');
  }

  const bounded = isNumber(move.distance) || (isNumber(move.turn) && move.turn !== 0);

  c.field(bounded, path, 'Give the move a distance or a turn.');
}

function checkDo(c: Checker, step: Record_, path: string) {
  c.field(isText(step.skill, 64), `${path}.skill`, 'Name the skill to run.');

  const holds = step.holds;
  const valid = isList(holds, 3) && holds.every((r) => typeof r === 'string' && RESOURCES.has(r));

  c.field(valid, `${path}.holds`, 'List what the skill holds: body, head or voice.');

  if (step.move !== undefined) checkMotion(c, step.move, `${path}.move`);
}

function checkInfer(c: Checker, step: Record_, path: string) {
  c.field(isText(step.model, 64), `${path}.model`, 'Name the model to run.');
  c.field(isText(step.input, 64), `${path}.input`, 'Name what the model looks at.');

  const output = step.output;
  const valid = isRecord(output) && typeof output.type === 'string' && DATA_TYPES.has(output.type);

  c.field(valid, `${path}.output`, 'Say what the model returns.');
}

function checkAsk(c: Checker, step: Record_, path: string) {
  const answers = step.answers;
  const valid = isList(answers, 8) && answers.length >= 2 && answers.every((a) => isText(a, 64));
  const unique = valid && new Set(answers).size === answers.length;

  c.field(isText(step.prompt), `${path}.prompt`, 'Write the question to ask.');
  c.field(valid && unique, `${path}.answers`, 'Give between 2 and 8 different answers.');
  c.field(step.input === undefined || isText(step.input, 64), `${path}.input`, 'Name what the model looks at.');
}

function checkWait(c: Checker, step: Record_, path: string) {
  const hasMs = step.ms !== undefined;

  if (step.until === undefined && !hasMs) c.add('invalid-field', path, 'Wait for a condition or a time.');

  if (hasMs) c.field(isNumber(step.ms) && step.ms > 0, `${path}.ms`, 'Wait for a positive time.');

  if (step.until !== undefined) checkCondition(c, step.until, `${path}.until`);
}

function checkTogether(c: Checker, step: Record_, path: string, depth: number) {
  const branches = step.branches;

  c.field(step.join === 'all' || step.join === 'any', `${path}.join`, 'Join on all or any.');

  if (!isList(branches, 8) || branches.length < 2) {
    c.add('invalid-field', `${path}.branches`, 'Run between 2 and 8 branches together.');

    return;
  }

  branches.forEach((b, i) => checkSteps(c, b, `${path}.branches[${i}]`, depth + 1));
}

function checkKind(c: Checker, step: Record_, path: string, depth: number) {
  switch (step.kind) {
    case 'do':
      return checkDo(c, step, path);
    case 'say':
      return c.field(isText(step.text, 500), `${path}.text`, 'Write what to say.');
    case 'infer':
      return checkInfer(c, step, path);
    case 'ask':
      return checkAsk(c, step, path);
    case 'wait':
      return checkWait(c, step, path);
    case 'together':
      return checkTogether(c, step, path, depth);
    default:
      checkCondition(c, step.test, `${path}.test`);
      checkSteps(c, step.then, `${path}.then`, depth + 1);
      checkSteps(c, step.else, `${path}.else`, depth + 1);
  }
}

export function checkStep(c: Checker, step: unknown, path: string, depth = 0) {
  c.steps += 1;

  if (c.steps > MAX_STEPS || depth > MAX_DEPTH) {
    c.add('too-large', path, 'This Routine has too many steps.');

    return;
  }

  if (!isRecord(step) || typeof step.kind !== 'string' || !STEP_KINDS.has(step.kind)) {
    c.add('invalid-field', path, 'A step is do, say, infer, ask, if, wait or together.');

    return;
  }

  if (step.id !== undefined) c.field(typeof step.id === 'string' && ID.test(step.id), `${path}.id`, 'Use a short id.');

  if (GUARDED_KINDS.has(step.kind)) checkGuard(c, step, path, depth);

  checkKind(c, step, path, depth);
}

function checkSteps(c: Checker, steps: unknown, path: string, depth: number) {
  if (!isList(steps)) {
    c.add('invalid-field', path, 'Steps are a list.');

    return;
  }

  steps.forEach((s, i) => checkStep(c, s, `${path}[${i}]`, depth));
}

function checkWatcher(c: Checker, w: unknown, path: string) {
  if (!isRecord(w)) return c.add('invalid-field', path, 'A watcher is an object.');

  c.field(typeof w.id === 'string' && ID.test(w.id), `${path}.id`, 'Give the watcher a short id.');
  c.field(isText(w.model, 64), `${path}.model`, 'Name the model the watcher runs.');
  c.field(isNumber(w.rateHz), `${path}.rateHz`, 'Set how often the watcher runs.');
  c.field(isNumber(w.maxAgeMs) && w.maxAgeMs > 0, `${path}.maxAgeMs`, 'Set how long its answer stays true.');

  const publishes = w.publishes;
  const typed = isRecord(publishes) && typeof publishes.type === 'string' && DATA_TYPES.has(publishes.type);

  c.field(typed, `${path}.publishes`, 'Say what the watcher publishes.');

  if (w.when !== undefined) checkCondition(c, w.when, `${path}.when`);
}

function checkReaction(c: Checker, r: unknown, path: string) {
  if (!isRecord(r)) return c.add('invalid-field', path, 'A reaction is an object.');

  c.field(typeof r.id === 'string' && ID.test(r.id), `${path}.id`, 'Give the reaction a short id.');
  checkCondition(c, r.when, `${path}.when`);
  c.field(isNumber(r.cooldownMs) && r.cooldownMs >= 0, `${path}.cooldownMs`, 'Set a cooldown of 0 or more.');
  c.field(['ignore', 'restart', 'queue'].includes(r.onRetrigger as string), `${path}.onRetrigger`, 'Pick a retrigger.');
  c.field(r.body === 'keepGoing' || r.body === 'stopFirst', `${path}.body`, 'Keep going or stop first.');
  checkSteps(c, r.steps, `${path}.steps`, 0);
}

function checkTop(c: Checker, input: Record_) {
  c.field(typeof input.id === 'string' && ID.test(input.id), 'id', 'Give the Routine a short id.');
  c.field(isText(input.name, 120), 'name', 'Name the Routine.');
  c.field(input.sentence === undefined || isText(input.sentence), 'sentence', 'Describe it in one sentence.');
  c.field(isText(input.safeStop, 64), 'safeStop', 'Name the skill that stops the robot safely.');

  const requires = input.requires;
  const known = isList(requires, 16) && requires.every((r) => typeof r === 'string' && CAPABILITIES.has(r));

  c.field(known, 'requires', 'List what the robot needs, such as a camera.');

  if (!isRecord(input.base) || input.base.kind !== 'do') c.add('invalid-field', 'base', 'The base is one Do step.');
  else checkStep(c, input.base, 'base');

  if (isList(input.watchers, 32)) input.watchers.forEach((w, i) => checkWatcher(c, w, `watchers[${i}]`));
  else c.add('invalid-field', 'watchers', 'Watchers are a list of up to 32.');

  if (isList(input.reactions, 64)) input.reactions.forEach((r, i) => checkReaction(c, r, `reactions[${i}]`));
  else c.add('invalid-field', 'reactions', 'Reactions are a list of up to 64.');
}

export type Validated = { ok: true; routine: Routine } | { ok: false; errors: RoutineError[] };

export function validateRoutine(input: unknown): Validated {
  if (!isRecord(input)) {
    return { ok: false, errors: [{ code: 'not-a-routine', message: 'This is not a Routine.' }] };
  }

  if (input.schema !== SCHEMA) {
    const message =
      typeof input.schema === 'number' && input.schema > SCHEMA
        ? 'A newer Basecase made this Routine. Update to open it.'
        : 'This Routine has an unknown version.';

    return { ok: false, errors: [{ code: 'schema-version', message, path: 'schema' }] };
  }

  const c = new Checker();

  checkTop(c, input);

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, routine: input as unknown as Routine };
}
