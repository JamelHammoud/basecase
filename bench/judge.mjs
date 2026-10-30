#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROBOTS } from './robots.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const REPLICA = `You are a strict industrial-design reviewer. Compare a CAD model (renders) with photos of the real robot.
Score each 0–10 (10 = indistinguishable in that respect, 5 = recognizable but clearly off, 0 = unrelated):
- proportions: relative heights and widths of every subassembly (head, torso, arms, base, legs…)
- shapes: profile of each shell (taper, roundness, domes, corner radii, seams)
- structure: correct parts and how they connect (joints in the right places, right number of segments)
- details: characteristic features (eyes, caps, cameras, panels, grippers, logos skipped is fine)
- craft: manufacturer-grade CAD at close range — fillets, seams and reveals, bosses, real fasteners,
  ribs, pads; no parts passing through each other; no plain primitive blocks (10 = indistinguishable
  from the maker's own CAD, 5 = clean but simplified, 2 = block-out)
- overall: would someone who knows the robot recognize it immediately?
Ignore colour shading differences, background, render style and which way the model is turned (orientation and pose). Judge from what is visible.`;

const CONCEPT = `You are a strict robotics design reviewer. A designer was given a brief and produced a CAD model (renders).
Score each 0–10 (10 = excellent, 5 = acceptable with clear problems, 0 = missing):
- brief: does it satisfy every requirement of the brief (size, mechanism, actuators, features)?
- engineering: is it buildable — an actuator at every joint, connected load paths, sensible link lengths and joint ranges, stable stance / support polygon, room for electronics and cables?
- cad: real CAD quality — rounded/chamfered shells, bosses, brackets and split lines vs plain primitive blocks
- design: coherent, attractive, consistent visual language and proportions
- craft: manufacturer-grade CAD at close range — fillets, seams and reveals, bosses, real fasteners,
  ribs, pads; no parts passing through each other; no plain primitive blocks (10 = production CAD,
  5 = clean but simplified, 2 = block-out)
- overall: would a hardware team want to start from this?`;

function claudeEnv() {
  const env = { ...process.env };

  for (const k of Object.keys(env)) if (/^CLAUDE_CODE_|^CLAUDECODE$|^ANTHROPIC_BASE_URL$/.test(k)) delete env[k];

  return env;
}

export function runClaude(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--tools',
      'Read',
      '--allowedTools',
      'Read',
      '--strict-mcp-config',
    ];
    const child = spawn('claude', args, { cwd, env: claudeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '',
      err = '';

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      try {
        const res = JSON.parse(out);
        const final = Array.isArray(res) ? res.findLast((e) => e.type === 'result') : res;

        resolve({ text: String(final?.result ?? ''), costUsd: final?.total_cost_usd ?? null });
      } catch {
        reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 400)}`));
      }
    });
  });
}

function scanStringChar(state, c) {
  if (c === '\\') return 1;

  if (c === '"') state.inStr = false;

  return 0;
}

const DEPTH_CHANGE = { '{': 1, '}': -1 };

function scanChar(state, c) {
  if (state.inStr) return scanStringChar(state, c);

  if (c === '"') state.inStr = true;
  else state.depth += DEPTH_CHANGE[c] ?? 0;

  return 0;
}

function matchingBrace(text, start) {
  const state = { depth: 0, inStr: false };

  for (let i = start; i < text.length; i++) {
    i += scanChar(state, text[i]);

    if (!state.inStr && text[i] === '}' && state.depth === 0) return i;
  }

  return -1;
}

function parseWithKey(json, key) {
  try {
    const obj = JSON.parse(json);

    return obj && key in obj ? obj : null;
  } catch {
    return null;
  }
}

const previousBrace = (text, before) => (before > 0 ? text.lastIndexOf('{', before - 1) : -1);

export function extractJson(text, key) {
  for (let start = text.lastIndexOf('{'); start >= 0; start = previousBrace(text, start)) {
    const end = matchingBrace(text, start);
    const obj = end >= 0 ? parseWithKey(text.slice(start, end + 1), key) : null;

    if (obj) return obj;
  }

  return null;
}

function copyRenders(runDir, dir) {
  const renders = fs
    .readdirSync(runDir)
    .filter((f) => /^render-.*\.png$/.test(f))
    .sort();

  for (const f of renders) fs.copyFileSync(path.join(runDir, f), path.join(dir, f));

  return renders;
}

function copyReferencePhotos(robot, robotKey, dir) {
  const refDir = path.join(here, 'data', robotKey, robot.judgeRefs ?? 'inputs');

  if (robot.concept || !fs.existsSync(refDir)) return [];

  const refs = [];

  for (const f of fs
    .readdirSync(refDir)
    .filter((x) => /\.(png|jpe?g|webp)$/i.test(x))
    .sort()) {
    fs.copyFileSync(path.join(refDir, f), path.join(dir, `ref-${f}`));
    refs.push(`ref-${f}`);
  }

  return refs;
}

function assemblyTree(robot, runDir) {
  if (!robot.concept || !fs.existsSync(path.join(runDir, 'parts.json'))) return '';

  const parts = JSON.parse(fs.readFileSync(path.join(runDir, 'parts.json'), 'utf8')).filter(
    (p) => p.visible !== false && p.role === 'solid',
  );
  const groups = {};

  for (const p of parts) {
    const group = p.group || 'Ungrouped';

    groups[group] ??= [];
    groups[group].push(p.name || p.id);
  }

  return Object.entries(groups)
    .map(([g, names]) => `- ${g}: ${names.join(', ')}`)
    .join('\n');
}

const CONCEPT_KEYS = ['brief', 'engineering', 'cad', 'design', 'craft', 'overall'];
const REPLICA_KEYS = ['proportions', 'shapes', 'structure', 'details', 'craft', 'overall'];
const INTERNALS_NOTE =
  '; render-internals-iso shows the model with its outer shells and covers hidden, so you can check mechanisms behind them';

function judgePrompt({ robot, refs, renders, tree, keys }) {
  return [
    robot.concept ? CONCEPT : REPLICA,
    '',
    robot.concept ? `Brief: ${robot.prompt}` : `Robot: ${robot.title}.`,
    refs.length ? `Photos of the real robot (open each with Read): ${refs.join(', ')}` : '',
    `Renders of the CAD model (open each with Read; render-detail-* are close-ups of subassemblies${robot.concept ? INTERNALS_NOTE : ''}): ${renders.join(', ')}`,
    tree
      ? `Assembly tree (part names by subassembly; real off-the-shelf parts are named after the product):\n${tree}`
      : '',
    '',
    `Open every image, then reply with ONLY a JSON object: {${keys.map((k) => `"${k}": <0-10>`).join(', ')}, "issues": [<the 5 biggest problems, most important first, each one short sentence>]}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function judgeRun(runDir, robotKey) {
  const robot = ROBOTS[robotKey];
  const dir = path.join(runDir, 'judge');

  fs.mkdirSync(dir, { recursive: true });

  const renders = copyRenders(runDir, dir);
  const refs = copyReferencePhotos(robot, robotKey, dir);
  const tree = assemblyTree(robot, runDir);
  const keys = robot.concept ? CONCEPT_KEYS : REPLICA_KEYS;
  const { text, costUsd } = await runClaude(judgePrompt({ robot, refs, renders, tree, keys }), dir);
  const verdict = extractJson(text, keys[0]);

  if (!verdict) throw new Error(`Judge gave no JSON: ${text.slice(0, 300)}`);

  const mean = keys.reduce((s, k) => s + Number(verdict[k] ?? 0), 0) / keys.length;
  const result = { score: Math.round(mean * 100) / 10, ...verdict, costUsd };

  fs.writeFileSync(path.join(runDir, 'judge.json'), JSON.stringify(result, null, 1));

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [run, robot] = process.argv.slice(2);

  judgeRun(path.join(here, 'runs', run, robot), robot)
    .then((r) => console.log(JSON.stringify(r, null, 1)))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
