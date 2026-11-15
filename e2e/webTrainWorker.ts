import type { Page } from 'playwright-core';
import { isPolicySpec } from '../src/sim/policy';
import { skillFiles, skillHash } from '../src/skills/artifacts';
import type { ForgeJob, ForgeOutcome } from '../src/skills/forgeRunner';
import { readyStand } from '../src/skills/hubSkillFixtures';
import { kitEnvironment } from '../src/skills/kitEnvironment';
import { kitJob } from '../src/skills/kitJob';
import type { SkillsJob, SkillsReply } from '../src/skills/skillsJob';
import type { SkillsMessage, SkillsRequest } from '../src/skills/skills.worker';

type KitJob = Extract<SkillsJob, { type: 'kit' }>;

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

export async function stubWebTrainWorker(page: Page) {
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

    if (!outcome)
      return route.fulfill({
        json: {
          name: 'Motor Kit: stand',
          xml: job.model.xml,
          job: kitJob(job.model, job.entry, { minutes: 1, seed: 1 }),
        },
      });

    if (!outcome.ok || !isPolicySpec(outcome.policy))
      return route.fulfill({ status: 500, body: 'The tab engine returned no policy.' });

    const skill = readyStand(job.model, job.design);

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
