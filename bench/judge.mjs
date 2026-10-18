#!/usr/bin/env node
/**
 * Vision judge: Claude Code (headless, read-only) grades renders of a model against a fixed
 * rubric. Used where geometry can't be scored: robots with no public CAD (against their
 * photos) and new concepts (against the brief).
 *
 *   node bench/judge.mjs <run> <robot>
 */
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

function runClaude(prompt, cwd) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read', '--strict-mcp-config'];
    const child = spawn('claude', args, { cwd, env: claudeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      try {
        // Either one result object or an array of stream events ending in the result
        const res = JSON.parse(out);
        const final = Array.isArray(res) ? res.findLast((e) => e.type === 'result') : res;
        resolve(String(final?.result ?? ''));
      } catch {
        reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 400)}`));
      }
    });
  });
}

/** The last balanced {...} in the reply that parses and has the score keys */
function extractJson(text, key) {
  for (let start = text.lastIndexOf('{'); start >= 0; start = text.lastIndexOf('{', start - 1)) {
    let depth = 0, inStr = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const obj = JSON.parse(text.slice(start, i + 1));
          if (obj && key in obj) return obj;
        } catch {
          /* keep looking */
        }
        break;
      }
    }
  }
  return null;
}

export async function judgeRun(runDir, robotKey) {
  const robot = ROBOTS[robotKey];
  const dir = path.join(runDir, 'judge');
  fs.mkdirSync(dir, { recursive: true });
  const renders = fs.readdirSync(runDir).filter((f) => /^render-.*\.png$/.test(f)).sort();
  for (const f of renders) fs.copyFileSync(path.join(runDir, f), path.join(dir, f));
  const refs = [];
  const refDir = path.join(here, 'data', robotKey, robot.judgeRefs ?? 'inputs');
  if (!robot.concept && fs.existsSync(refDir)) {
    for (const f of fs.readdirSync(refDir).filter((x) => /\.(png|jpe?g|webp)$/i.test(x)).sort()) {
      fs.copyFileSync(path.join(refDir, f), path.join(dir, `ref-${f}`));
      refs.push(`ref-${f}`);
    }
  }
  // For new designs, the assembly tree shows mechanisms that sit behind covers
  let tree = '';
  if (robot.concept && fs.existsSync(path.join(runDir, 'parts.json'))) {
    const parts = JSON.parse(fs.readFileSync(path.join(runDir, 'parts.json'), 'utf8')).filter((p) => p.visible !== false && p.role === 'solid');
    const groups = {};
    for (const p of parts) (groups[p.group || 'Ungrouped'] ??= []).push(p.name || p.id);
    tree = Object.entries(groups).map(([g, names]) => `- ${g}: ${names.join(', ')}`).join('\n');
  }
  const keys = robot.concept ? ['brief', 'engineering', 'cad', 'design', 'craft', 'overall'] : ['proportions', 'shapes', 'structure', 'details', 'craft', 'overall'];
  const prompt = [
    robot.concept ? CONCEPT : REPLICA,
    '',
    robot.concept ? `Brief: ${robot.prompt}` : `Robot: ${robot.title}.`,
    refs.length ? `Photos of the real robot (open each with Read): ${refs.join(', ')}` : '',
    `Renders of the CAD model (open each with Read; render-detail-* are close-ups of subassemblies${robot.concept ? '; render-internals-iso shows the model with its outer shells and covers hidden, so you can check mechanisms behind them' : ''}): ${renders.join(', ')}`,
    tree ? `Assembly tree (part names by subassembly; real off-the-shelf parts are named after the product):\n${tree}` : '',
    '',
    `Open every image, then reply with ONLY a JSON object: {${keys.map((k) => `"${k}": <0-10>`).join(', ')}, "issues": [<the 5 biggest problems, most important first, each one short sentence>]}`,
  ]
    .filter(Boolean)
    .join('\n');
  const text = await runClaude(prompt, dir);
  const verdict = extractJson(text, keys[0]);
  if (!verdict) throw new Error(`Judge gave no JSON: ${text.slice(0, 300)}`);
  const mean = keys.reduce((s, k) => s + Number(verdict[k] ?? 0), 0) / keys.length;
  const result = { score: Math.round(mean * 100) / 10, ...verdict };
  fs.writeFileSync(path.join(runDir, 'judge.json'), JSON.stringify(result, null, 1));
  return result;
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [run, robot] = process.argv.slice(2);
  judgeRun(path.join(here, 'runs', run, robot), robot)
    .then((r) => console.log(JSON.stringify(r, null, 1)))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
