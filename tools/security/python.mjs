import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finding, has, parseJson, root, run } from './run.mjs';

const PROJECTS = ['electron/trainer', 'electron/simready'];

function auditProject(project) {
  const cwd = path.join(root, project);
  const exported = run('uv', ['export', '--frozen', '--no-hashes', '--no-emit-project', '-q'], { cwd });

  if (exported.status !== 0) return [finding('high', `${project}: uv export failed`, exported.stderr.trim())];

  const requirements = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-audit-')), 'requirements.txt');

  fs.writeFileSync(requirements, exported.stdout);

  const audited = run('uvx', ['pip-audit', '--no-deps', '--disable-pip', '-r', requirements, '-f', 'json']);
  const report = parseJson(audited.stdout);

  fs.rmSync(path.dirname(requirements), { recursive: true, force: true });

  if (!report) return [finding('high', `${project}: pip-audit failed`, audited.stderr.trim().slice(-400))];

  return report.dependencies.flatMap((dep) =>
    (dep.vulns ?? []).map((vuln) =>
      finding(
        'high',
        `${project}: ${dep.name} ${dep.version} (${vuln.id})`,
        `${[vuln.id, ...(vuln.aliases ?? [])].join(', ')}: ${String(vuln.description ?? '').slice(0, 240)}`,
        vuln.fix_versions?.length
          ? `Raise to ${vuln.fix_versions.join(' or ')} (pyproject.toml floor, then uv lock --upgrade-package ${dep.name})`
          : 'No fixed version: check whether the vulnerable code path is used',
      ),
    ),
  );
}

export function pythonAudit() {
  if (!has('uv')) return { name: 'Python', error: 'uv is not installed' };

  return { name: 'Python', findings: PROJECTS.flatMap(auditProject) };
}
