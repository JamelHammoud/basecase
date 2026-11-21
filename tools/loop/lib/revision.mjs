import path from 'node:path';
import { creditProblems } from '../credit.mjs';
import { HOME_CHECKOUT } from './paths.mjs';
import { protectedIn, protectedList } from './protected.mjs';
import { landedIn } from './landed.mjs';
import { kindOf, pullTitle, revisedBody } from './pull.mjs';
import { run } from './sh.mjs';
import { voiceNewPages, voiced } from './voiceHook.mjs';
import { saveDelivery } from './deliveryState.mjs';
import { deliver } from './deliver.mjs';
import { keepStepLinks } from './stepLinks.mjs';

const git = (args, cwd, opts = {}) => run('git', args, { cwd, ...opts });

function commitRevision(dir, output) {
  if (git(['status', '--porcelain'], dir).out.trim() === '') return false;

  voiceNewPages(dir);
  git(['add', '-A'], dir);
  git(['commit', '-q', '-F', '-'], dir, { input: output.commitMessage });
  run('node', [path.join(HOME_CHECKOUT, 'tools', 'check-credit.mjs'), 'origin/main..HEAD'], { cwd: dir });

  return true;
}

export function publishRevision(pull, { dir, output }) {
  const problems = creditProblems(output.commitMessage);

  if (problems.length > 0) throw new Error(`Commit message credits a model or tool: ${problems.join('; ')}`);

  const committed = commitRevision(dir, output);
  const kind = kindOf(pull.title);
  const landed = landedIn('origin/main...HEAD', dir);
  const restated = kind ? revisedBody(pull.body, { ...output, kind }, { branch: pull.headRefName, landed }) : pull.body;
  const heading = restated.includes('\n## Revisions\n') ? '' : '\n\n## Revisions\n';
  const touched = committed ? protectedIn('HEAD~1..HEAD', dir) : [];
  const line =
    touched.length === 0 ? output.revision : `${output.revision} Protected paths: ${protectedList(touched)}.`;
  const entry = saveDelivery({
    dir,
    branch: pull.headRefName,
    number: pull.number,
    sha: committed ? git(['rev-parse', 'HEAD'], dir).out.trim() : pull.headRefOid,
    metadataOnly: !committed,
    createdAt: Date.now(),
    attempts: 0,
    title: kind ? pullTitle({ kind, title: output.title }) : pull.title,
    body: voiced(keepStepLinks(`${restated}${heading}\n- ${line}`, pull), 'pull', {
      cwd: dir,
      taskId: `pull:${pull.number}`,
    }),
  });

  return deliver(entry);
}
