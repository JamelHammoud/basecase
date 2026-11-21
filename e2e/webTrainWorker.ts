import type { Page } from 'playwright-core';
import { isPolicySpec } from '../src/sim/policy';
import {
  currentDesign,
  skillFiles,
  skillFromTraining,
  skillHash,
  withEvidence,
  type Skill,
} from '../src/skills/artifacts';
import { environmentHash } from '../src/skills/environment';
import { kitSkillName } from '../src/skills/motorKit';
import type { ForgeJob, ForgeOutcome } from '../src/skills/forgeRunner';
import { readyStand } from '../src/skills/hubSkillFixtures';
import { kitEnvironment } from '../src/skills/kitEnvironment';
import { kitJob } from '../src/skills/kitJob';
import type { SkillsJob, SkillsReply } from '../src/skills/skillsJob';
import type { SkillsMessage, SkillsRequest } from '../src/skills/skills.worker';

export type KitJob = Extract<SkillsJob, { type: 'kit' }>;

export function readyKit(job: Pick<KitJob, 'model' | 'design' | 'entry' | 'warm'>): Skill {
  const stand = readyStand(job.model, job.design);
  const environment = kitEnvironment(job.model, job.entry);
  const current = currentDesign({ design: job.design, model: job.model, environment });
  const skill = skillFromTraining({
    name: kitSkillName(job.entry),
    start: null,
    current,
    environment,
    controller: stand.controller,
  });
  const evidence = {
    ...stand.evidence!,
    binding: { ...current.hashes, contract: current.contract, environment: environmentHash(environment) },
  };

  return {
    ...withEvidence(skill, evidence, environment),
    origin: stand.origin,
    warmStartFrom: job.warm?.from ?? null,
  };
}

function workerFixture() {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  let job: KitJob;
  let result: { path: string; text: string; reply: SkillsReply };
  const send = (message: SkillsMessage) => scope.postMessage(message);
  const request = async (body: unknown) => {
    const response = await fetch('/__web-train', { method: 'POST', body: JSON.stringify(body) });

    if (!response.ok) throw new Error(await response.text());

    return response.json();
  };
  const handle = async (message: SkillsRequest) => {
    if (message.type === 'kit') {
      job = message;

      const forge: ForgeJob = await request({ job });

      send({ type: 'forge', call: 1, job: forge });

      return;
    }

    if (message.type === 'forge-result') {
      result = await request({ job, outcome: message.outcome });
      send({ type: 'save', call: 2, path: result.path, text: result.text });

      return;
    }

    if (message.type !== 'save-result') throw new Error('Expected a Kit worker message.');

    if (message.error) throw new Error(message.error);

    send(result.reply);
  };

  scope.onmessage = (event: MessageEvent<SkillsRequest>) => {
    void handle(event.data).catch((error: Error) => send({ type: 'error', message: error.message }));
  };
}

export async function stubWebTrainWorker(page: Page, jobs: KitJob[] = []) {
  const trained: string[] = [];

  await page.context().route(/\/skills\.worker[.-].*(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Cross-Origin-Embedder-Policy': 'credentialless' },
      body: `(${workerFixture.toString()})()`,
    }),
  );
  await page.context().route('**/__web-train', async (route) => {
    const { job, outcome } = route.request().postDataJSON() as { job: KitJob; outcome?: ForgeOutcome };

    if (!outcome) {
      jobs.push(job);

      return route.fulfill({
        json: {
          name: `Motor Kit: ${job.entry}`,
          xml: job.model.xml,
          job: { ...kitJob(job.model, job.entry, { minutes: 1, seed: 1 }), warmPolicy: job.warm?.policy },
        },
      });
    }

    if (!outcome.ok || !isPolicySpec(outcome.policy))
      return route.fulfill({ status: 500, body: 'The tab engine returned no policy.' });

    const skill = readyKit(job);

    skill.controller = { kind: 'policy', policy: outcome.policy, robot: job.design };

    const hash = skillHash(skill);
    const reply: SkillsReply = {
      type: 'kit',
      outcome: {
        kind: 'skill',
        skill,
        environment: kitEnvironment(job.model, job.entry),
        cost: { wallS: 1, steps: 1, forgeRuns: 1 },
      },
    };

    trained.push(hash);
    await route.fulfill({ json: { path: skillFiles(hash).skill, text: JSON.stringify(skill), reply } });
  });

  return trained;
}
