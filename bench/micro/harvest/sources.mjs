import fs from 'node:fs';
import path from 'node:path';
import { faultsIn, kindOfText } from './kinds.mjs';

export const CHECK_TOOLS = /(?:^|__)(?:get_readiness|check_assembly|check_scene)$/;
export const AGENT_PATHS = [
  /^electron\/cad-agent-prompt\.mjs$/,
  /^electron\/cad-mcp\//,
  /^electron\/cad-agent-guides\//,
  /^bench\//,
];

const DESIGN_OBJECTS =
  '(?:screws?|inserts?|nuts?|brackets?|shells?|walls?|holes?|servos?|horns?|joints?|parts?|arms?|legs?|heads?|bod(?:y|ies)|robots?)';
const BUILT =
  '(?:places?|placed|puts?|designs?|designed|models?|modell?ed|builds?|built|leaves?|left|uses?|used|makes?|made|picks?|picked|forgets?|forgot|skips?|skipped)';
const AGENT_BUILT = new RegExp(
  `\\bagent(?:'s)?\\b[^.\\n]{0,60}\\b${BUILT}\\b[^.\\n]{0,60}\\b${DESIGN_OBJECTS}\\b`,
  'i',
);
const FINDING_LINE = /^- \*\*(?:blocker|minor)\*\*:?\s*(.+)$/gm;
const EXCERPT = 240;

const excerpt = (text) => {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT)}…` : flat;
};

const textOfUpdate = (u) => {
  const parts = u._meta?.claudeCode?.toolResponse ?? u.content ?? [];

  return (Array.isArray(parts) ? parts : [parts])
    .map((p) => p?.text ?? p?.content?.text ?? '')
    .join('\n')
    .trim();
};

export function lastCheck(lines) {
  const names = new Map();
  let last = null;

  for (const line of lines) {
    const u = line.update;

    if (line.type !== 'acp-session-update' || !u?.toolCallId) continue;

    const name = u._meta?.claudeCode?.toolName ?? u.title ?? names.get(u.toolCallId) ?? '';

    names.set(u.toolCallId, name);

    const text = u.sessionUpdate === 'tool_call_update' ? textOfUpdate(u) : '';

    if (CHECK_TOOLS.test(name) && text) last = { tool: name.replace(/^mcp__\w+__/, ''), text };
  }

  return last;
}

export function missedFaults(scene, check) {
  if (!check) return [];

  return faultsIn(scene).filter((f) => !f.ids.some((id) => check.text.includes(id)));
}

const readLines = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });

function runDirs(root) {
  if (!fs.existsSync(root)) return [];

  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'));
  const here = ['scene.json', 'events.jsonl'].every((f) => fs.existsSync(path.join(root, f))) ? [root] : [];

  return [...here, ...entries.flatMap((e) => runDirs(path.join(root, e.name)))];
}

export function runCandidates(runsRoot, since) {
  return runDirs(runsRoot)
    .filter((dir) => fs.statSync(path.join(dir, 'scene.json')).mtime.toISOString() >= since)
    .flatMap((dir) => {
      const check = lastCheck(readLines(path.join(dir, 'events.jsonl')));
      const scene = JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8'));
      const ref = path.relative(path.dirname(runsRoot), dir);

      return missedFaults(scene, check).map((f) => ({
        source: 'run',
        ref,
        kind: f.kind,
        graded: true,
        ids: f.ids,
        text: `Last ${check.tool}: ${excerpt(check.text.split('\n')[0])}`,
      }));
    });
}

const touchesAgent = (pull) => (pull.files ?? []).some((f) => AGENT_PATHS.some((re) => re.test(f.path)));

const textCandidate = ({ source, ref, at, text }) => ({ source, ref, at, text: excerpt(text), ...kindOfText(text) });

export const namesDesignFault = (text) => kindOfText(text).graded || AGENT_BUILT.test(text);

export function reviewCandidates({ comments, pulls, isReview }) {
  const agentPulls = new Set(pulls.filter((p) => p.mergedAt && touchesAgent(p)).map((p) => p.number));

  return comments
    .filter((c) => agentPulls.has(c.number) && isReview(c))
    .flatMap((c) =>
      [...c.body.matchAll(FINDING_LINE)]
        .map((m) => m[1])
        .filter(namesDesignFault)
        .map((text) => textCandidate({ source: 'review', ref: `#${c.number}`, at: c.createdAt, text })),
    );
}

export function commentCandidates({ comments, loopNumbers, isOwnerNote }) {
  return comments
    .filter((c) => loopNumbers.has(c.number) && isOwnerNote(c))
    .flatMap((c) =>
      c.body
        .split(/\n\s*\n/)
        .filter(namesDesignFault)
        .map((text) => textCandidate({ source: 'comment', ref: `#${c.number}`, at: c.createdAt, text })),
    );
}
