import { arcOf, BIG_BET, MAX_ARCS, planArcs, resolveArc, withArc, withTask } from './arcs.mjs';

const issueNumber = (url) => Number(/\/issues\/(\d+)/.exec(url ?? '')?.[1]) || null;

const numbers = (list) => new Set(list.map((issue) => issue.number));

const STEP_LABELS = ['loop:next', 'loop:building'];

function openStep(gh, title) {
  const match = gh.findOpenIssue?.({ title, similarAmong: STEP_LABELS });

  return match?.labels.some((label) => STEP_LABELS.includes(label)) ? match : null;
}

function tracker(issues, gh) {
  const saved = new Map(issues.map((issue) => [issue.number, issue.body ?? '']));
  const current = new Map(saved);

  return {
    body: (number) => current.get(number) ?? '',
    set: (number, body) => current.set(number, body),
    track: (number, body) => {
      saved.set(number, body);
      current.set(number, body);
    },
    flush: () => {
      for (const [number, body] of current) {
        if (body !== saved.get(number)) gh.setIssueBody(number, body);
      }
    },
  };
}

function link(ctx, stepNumber, arcNumber) {
  ctx.docs.set(stepNumber, withArc(ctx.docs.body(stepNumber), arcNumber));
  ctx.docs.set(arcNumber, withTask(ctx.docs.body(arcNumber), stepNumber));
  ctx.stepArcs.set(stepNumber, arcNumber);
}

function linkSteps(ctx, world) {
  const open = numbers(world.arcs);

  for (const step of world.steps) {
    const arc = arcOf(step, world.arcs);

    if (open.has(arc)) link(ctx, step.number, arc);
    else ctx.log(`step #${step.number} names no open arc`);
  }
}

function retire(ctx, { number, reason, into }) {
  const moved = [...ctx.stepArcs].filter(([, arc]) => arc === number).map(([step]) => step);

  if (into) {
    for (const step of moved) link(ctx, step, into);

    ctx.movedTo.set(number, into);

    const steps = moved.length > 0 ? `, with its open steps ${moved.map((step) => `#${step}`).join(', ')}` : '';

    ctx.gh.commentOnIssue(into, `#${number} merged into this arc${steps}.`);
  }

  ctx.gh.closeIssue(number, into ? `Merged into #${into}. ${reason}` : reason, into ? 'not planned' : 'completed');
  ctx.log(into ? `merged arc #${number} into #${into}` : `retired arc #${number}`);
}

function openArc(ctx, arc) {
  const url = ctx.gh.createIssue({
    title: arc.title,
    body: arc.body,
    labels: ['loop:arc', ...(arc.bigBet ? [BIG_BET] : [])],
    similarAmong: ['loop:arc'],
  });
  const number = issueNumber(url);

  ctx.log(`arc ${url ?? `skipped, already open: ${arc.title}`}`);

  if (!number) return;

  ctx.docs.track(number, arc.body);
  ctx.opened.set(arc.title, number);
  ctx.open.push({ number, title: arc.title });
}

function stepBody(s, { request, promotes, arc }) {
  const head = [request ? `Request: #${request}` : '', promotes ? `Idea: #${promotes}` : '', arc ? `Arc: #${arc}` : '']
    .filter(Boolean)
    .join('\n');

  return `${head ? `${head}\n` : ''}Kind: ${s.kind}\n\n${s.body}`;
}

function stepLog({ owner, url, title, arc }) {
  if (owner) return `already open as ${owner.url}: ${title}`;

  return url ? `step ${url}${arc === null ? '' : `, no open arc ${arc}`}` : `skipped, already open: ${title}`;
}

function notePlanned(ctx, request, url) {
  ctx.planned.set(request, [...(ctx.planned.get(request) ?? []), issueNumber(url)]);
}

function fileStep(ctx, s) {
  const target = resolveArc(s.arc, ctx);

  if (target.refused) {
    ctx.log(`skipped step, its arc was refused: ${s.title}`);

    return;
  }

  const request = ctx.known.requests.has(s.request) ? s.request : null;
  const promotes = ctx.known.ideas.has(s.promotes) ? s.promotes : null;
  const labels = ['loop:next', `loop:${s.kind}`, ...(request ? ['loop:priority'] : [])];
  const owner = openStep(ctx.gh, s.title);
  const url =
    owner?.url ??
    ctx.gh.createIssue({
      title: s.title,
      body: stepBody(s, { request, promotes, arc: target.number }),
      labels,
      similarAmong: STEP_LABELS,
    });
  const number = owner ? null : issueNumber(url);

  ctx.log(stepLog({ owner, url, title: s.title, arc: target.number ? null : s.arc }));

  if (!url) return;

  if (number && target.number) ctx.docs.set(target.number, withTask(ctx.docs.body(target.number), number));

  if (request) notePlanned(ctx, request, url);

  if (promotes) {
    ctx.gh.closeIssue(promotes, `Promoted to ${url}.`);
    ctx.known.ideas.delete(promotes);
  }
}

export const plannedLine = (steps) => {
  const refs = steps.map((step) => `#${step}`);
  const list = refs.length > 1 ? `${refs.slice(0, -1).join(', ')} and ${refs.at(-1)}` : refs[0];

  return `Planned as ${list}.`;
};

function tellRequests(ctx) {
  for (const [request, steps] of ctx.planned) {
    ctx.gh.editIssueLabels(request, { add: ['loop:request'] });
    ctx.gh.commentOnIssue(request, plannedLine(steps.filter(Boolean)));
  }
}

function closeIdeasAndRequests(ctx, output) {
  for (const drop of output.dropIdeas.filter((d) => ctx.known.ideas.has(d.number))) {
    ctx.gh.closeIssue(drop.number, `Not planned: ${drop.reason}`, 'not planned');
    ctx.log(`dropped idea #${drop.number}`);
  }

  for (const done of output.doneRequests.filter((d) => ctx.known.tracked.has(d.number))) {
    ctx.gh.closeIssue(done.number, done.comment);
  }
}

export function applyPlan(output, world, { log, gh }) {
  const plan = planArcs(world.arcs, output);
  const retired = new Set(plan.retire.map((arc) => arc.number));
  const ctx = {
    gh,
    log,
    docs: tracker([...world.arcs, ...world.steps], gh),
    stepArcs: new Map(),
    planned: new Map(),
    movedTo: new Map(),
    opened: new Map(),
    open: world.arcs.filter((arc) => !retired.has(arc.number)),
    refused: plan.refused,
    known: {
      requests: numbers([...world.requests, ...world.tracked]),
      ideas: numbers(world.ideas),
      tracked: numbers(world.tracked),
    },
  };

  linkSteps(ctx, world);

  for (const kept of plan.kept) log(`kept #${kept.number}: ${kept.why}`);

  for (const arc of plan.retire) retire(ctx, arc);

  for (const arc of plan.opening) openArc(ctx, arc);

  for (const title of plan.refused) log(`refused arc "${title}": ${MAX_ARCS} arcs would already be open`);

  for (const s of output.steps) fileStep(ctx, s);

  tellRequests(ctx);

  ctx.docs.flush();
  closeIdeasAndRequests(ctx, output);
}
