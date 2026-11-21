import { checkedDeclaration, identity, readFile } from './evaluationFiles.mjs';

const fail = () => {
  throw new Error('Comparison evidence differs.');
};
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function checkTrial(trial, role, report) {
  if (
    !trial ||
    trial.revision !== report[role] ||
    !hash(trial.model) ||
    typeof trial.passed !== 'boolean' ||
    !Number.isFinite(trial.margin) ||
    !Array.isArray(trial.failed) ||
    trial.failed.some((label) => typeof label !== 'string' || label.length > 512)
  )
    fail();

  if (trial.recording && (!report.files[trial.recording] || !report.files[trial.modelInput])) fail();
}

function verifyPairs(report, expected) {
  for (const [index, pair] of report.pairs.entries()) {
    if (pair.case !== expected[index].case || pair.seed !== expected[index].seed) fail();

    checkTrial(pair.baseline, 'baseline', report);
    checkTrial(pair.candidate, 'candidate', report);

    if (pair.marginDelta !== pair.candidate.margin - pair.baseline.margin) fail();
  }
}

export function verifyComparison(root, report) {
  const declaration = checkedDeclaration(JSON.parse(readFile(root, 'inputs/evaluation.json')));

  if (
    declaration.id !== report.evaluation ||
    !['complete', 'incomplete'].includes(report.status) ||
    report.version !== 1
  )
    fail();

  for (const name of ['baseline', 'candidate']) if (report[name] !== identity(declaration.revisions[name])) fail();

  for (const name of Object.keys(declaration.files))
    if (report.files[`inputs/${name}`] !== declaration.files[name]) fail();

  if (!report.files['inputs/evaluation.json'] || !Array.isArray(report.pairs)) fail();

  const expected = declaration.cases.flatMap((kase) => declaration.seeds.map((seed) => ({ case: kase.id, seed })));

  if (
    report.pairs.length > expected.length ||
    (report.status === 'complete' && report.pairs.length !== expected.length)
  )
    fail();

  verifyPairs(report, expected);

  const losses = report.pairs.filter((pair) => pair.baseline.passed && !pair.candidate.passed).length;
  const gains = report.pairs.filter((pair) => !pair.baseline.passed && pair.candidate.passed).length;

  if (report.regressions !== losses || report.improvements !== gains) fail();

  return declaration;
}

export async function verifyRetainedEvidence(root, report, load) {
  const { decodeTryArchive } = await load('src/cases/tryArchiveJobs.ts');
  const { restoreTyped } = await load('src/cases/recordingValues.ts');
  const { hashOf } = await load('src/skills/hash.ts');

  for (const pair of report.pairs) {
    for (const role of ['baseline', 'candidate'])
      verifyRetainedTrial(root, { report, pair, role }, { decodeTryArchive, restoreTyped, hashOf });
  }
}

function verifyRetainedTrial(root, { report, pair, role }, { decodeTryArchive, restoreTyped, hashOf }) {
  const trial = pair[role];

  if (!trial.recording) return;

  const entries = decodeTryArchive(readFile(root, trial.recording));
  const source = entries[0]?.recording.evaluation;
  const model = JSON.parse(readFile(root, trial.modelInput), restoreTyped);

  if (
    entries.length !== 1 ||
    !source ||
    source.evaluation !== report.evaluation ||
    source.revision !== report[role] ||
    source.seed !== pair.seed ||
    source.kase.id !== pair.case ||
    hashOf(model) !== hashOf(source.model) ||
    entries[0].stored.robot.modelHash !== trial.model ||
    source.passed !== trial.passed ||
    source.margin !== trial.margin
  )
    fail();
}
