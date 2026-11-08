import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'routines', 'kit');
const picks = process.argv.slice(2).map((a) => {
  const [robot, entry] = a.split(':');

  return { robot, entry, from: path.join(ROOT, 'verify', 'out', 'kit', robot, entry) };
});
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
const forgeVersion = /version = "([^"]+)"/.exec(
  fs.readFileSync(path.join(ROOT, 'forge', 'crates', 'forge-train', 'Cargo.toml'), 'utf8'),
)[1];

fs.mkdirSync(OUT, { recursive: true });

const policies = picks.map(({ robot, entry, from }) => {
  const skill = JSON.parse(fs.readFileSync(path.join(from, 'skill.json'), 'utf8'));
  const file = `${robot}-${entry}.skill.json`;

  fs.writeFileSync(path.join(OUT, file), JSON.stringify(skill));

  return {
    file,
    robot,
    skill: skill.name,
    forge: `forge-train ${forgeVersion} at ${commit}`,
    mujoco: skill.controller.policy.mujoco,
    steps: skill.origin.cost.steps,
    wallS: Math.round(skill.origin.cost.wallS),
    arena: skill.evidence.summary,
  };
});

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({ policies }, null, 2)}\n`);
console.log(JSON.stringify(policies, null, 2));
