import { verifyComparison } from './evaluationEvidence.mjs';
import { checkedFiles, identity, readFile, LIMITS } from './evaluationFiles.mjs';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const result = (trial) =>
  `${trial.passed ? 'Passed' : 'Failed'} ${trial.margin.toFixed(3)} ${trial.failed.map(escape).join(', ')}${trial.recording ? ` <a href="${escape(trial.recording)}">Recording</a>` : ''}`;

export function reportHtml(report) {
  const rows = report.pairs
    .map(
      (pair) =>
        `<tr><td>${escape(pair.case)}</td><td>${pair.seed}</td><td>${result(pair.baseline)}</td><td>${result(pair.candidate)}</td><td>${pair.marginDelta.toFixed(3)}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Case comparison</title><style>body{font:16px system-ui;margin:clamp(16px,3vw,32px);max-width:1100px;color:#ddd;background:#181818}body{overflow-wrap:anywhere}.trials{overflow-x:auto}.trials:focus-visible{outline:2px solid #0d99ff}table{width:100%;min-width:680px;table-layout:fixed;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #444}a{color:#79c6ff;display:inline-flex;align-items:center;min-height:32px}code{overflow-wrap:anywhere}</style><h1 id="comparison">Case comparison</h1><p>${escape(report.status)}${report.reason ? `: ${escape(report.reason)}` : ''}</p><p>Baseline <code>${escape(report.baseline)}</code></p><p>Candidate <code>${escape(report.candidate)}</code></p><p>Evaluation <code>${escape(report.evaluation)}</code></p><p>Regressions: ${report.regressions}. Improvements: ${report.improvements}.</p><div class="trials" role="region" aria-labelledby="comparison" tabindex="0"><table><thead><tr><th>Case</th><th>Seed</th><th>Baseline</th><th>Candidate</th><th>Margin change</th></tr></thead><tbody>${rows}</tbody></table></div><p><a href="comparison.json">JSON</a></p></html>`;
}

export function inspectReport(root) {
  const report = JSON.parse(readFile(root, 'comparison.json'));
  const { id, ...body } = report;

  if (report.format !== 'basecase-comparison' || identity(body) !== id) throw new Error('Comparison evidence differs.');

  checkedFiles(root, report.files, LIMITS.files + 1 + 2 * LIMITS.recordings);
  verifyComparison(root, report);

  if (readFile(root, 'report.html').toString() !== reportHtml(report)) throw new Error('Comparison evidence differs.');

  return report;
}
