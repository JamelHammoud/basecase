import { finding, parseJson, run } from './run.mjs';

const NPM_SEVERITY = { critical: 'critical', high: 'high', moderate: 'moderate', low: 'low', info: 'info' };

function advisories(vuln) {
  return vuln.via
    .filter((via) => typeof via === 'object')
    .map((via) => `${via.title} (${via.url})`)
    .filter((line, i, all) => all.indexOf(line) === i);
}

function fixText(vuln) {
  if (vuln.fixAvailable === true) return 'npm audit fix';

  if (vuln.fixAvailable === false) return 'No fix published: replace the package or wait for one, and check exposure';

  const { name, version, isSemVerMajor } = vuln.fixAvailable;

  return `${isSemVerMajor ? 'Major upgrade' : 'Upgrade'}: ${name}@${version}`;
}

function vulnFinding(vuln) {
  const via = advisories(vuln);
  const chain = via.length > 0 ? via.join('; ') : `through ${vuln.via.join(', ')}`;

  return finding(
    NPM_SEVERITY[vuln.severity] ?? 'moderate',
    `${vuln.name} ${vuln.range}${vuln.isDirect ? ' (direct)' : ''}`,
    chain,
    fixText(vuln),
  );
}

export function npmAudit() {
  const result = run('npm', ['audit', '--json']);
  const report = parseJson(result.stdout);

  if (!report?.vulnerabilities) {
    return { name: 'npm audit', error: result.stderr.trim() || 'npm audit returned no report' };
  }

  return { name: 'npm audit', findings: Object.values(report.vulnerabilities).map(vulnFinding) };
}

const majorOf = (version) => Number(String(version).split('.')[0]);

export function npmOutdated() {
  const result = run('npm', ['outdated', '--json']);
  const report = parseJson(result.stdout || '{}');

  if (!report) return { name: 'npm outdated', error: result.stderr.trim() || 'npm outdated failed' };

  const findings = Object.entries(report).map(([name, info]) => {
    const major = majorOf(info.latest) > majorOf(info.current);

    return finding(
      major ? 'low' : 'info',
      `${name} ${info.current} → ${info.latest}`,
      major ? 'Major version behind' : `In range: ${info.wanted}`,
      major ? `npm install ${name}@latest, then read its changelog` : 'npm update',
    );
  });

  return { name: 'npm outdated', findings };
}
