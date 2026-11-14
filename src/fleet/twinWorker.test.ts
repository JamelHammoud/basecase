import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureModel } from '../skills/fixtureModels';
import type { ArenaEvidence } from '../skills/artifacts';
import { moveEnvironment } from '../skills/moveEnvironment';
import { fixtureMoveSkill, quadSit } from '../skills/moveFixtures';
import { inSkillsWorker } from '../skills/skillsClient';
import type { SkillsJob, SkillsReply } from '../skills/skillsJob';
import { SkillsRuntime } from '../skills/skillsRuntime';

afterEach(() => vi.unstubAllGlobals());

describe('fleet twin worker', () => {
  it('sends the twin model to the skills worker and returns its Arena evidence', async () => {
    const model = fixtureModel('quad-servo');
    const animation = quadSit();
    const skill = fixtureMoveSkill({ model, animation });
    const environment = moveEnvironment(model, animation);
    const evidence: ArenaEvidence = {
      arenaVersion: 1,
      binding: { contract: 'c', physics: 'p', actuators: 'a', environment: 'e' },
      confidence: 0.95,
      bar: 0.75,
      variants: [],
      lowerBound: 0,
      passed: false,
      conditions: [],
      summary: '',
      saltCommitment: 's',
    };
    const sent: SkillsJob[] = [];
    const terminate = vi.fn();
    const forge = vi.fn();

    class SkillsWorker {
      onmessage: ((event: { data: SkillsReply }) => void) | null = null;
      terminate = terminate;

      postMessage(job: SkillsJob) {
        sent.push(job);
        this.onmessage?.({ data: { type: 'twin', evidence } });
      }
    }

    vi.stubGlobal('Worker', SkillsWorker);

    const runtime = new SkillsRuntime({
      runner: inSkillsWorker,
      forge,
      save: async () => {},
      loadSkill: async () => null,
      onRecord: () => {},
      onChange: () => {},
    });

    expect(await runtime.twin(model, skill, environment)).toEqual(evidence);
    expect(sent).toEqual([{ type: 'twin', model, skill, environment }]);
    expect(forge).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledOnce();
  });
});
