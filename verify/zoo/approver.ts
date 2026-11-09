import { contractHash } from '../../src/skills/artifacts';
import { evaluateContract } from '../../src/skills/contract';
import type { Approval, Proposal } from './anything';
import type { Poser } from './bodies';
import { traceOf, type Labelled } from './rollouts';

export const MAX_ROUNDS = 3;

async function builderVerdict(poser: Poser, rollout: Labelled, proposal: Proposal): Promise<boolean | null> {
  try {
    return (await evaluateContract(proposal.contract, traceOf(poser, rollout.qpos, proposal.signals))).passed;
  } catch {
    return null;
  }
}

export class StandIn {
  rounds = 0;
  approvedHash: string | null = null;
  private readonly poser: Poser | null;
  private readonly rollouts: Labelled[];

  constructor(poser: Poser | null, rollouts: Labelled[]) {
    this.poser = poser;
    this.rollouts = rollouts;
  }

  async approve(proposal: Proposal): Promise<Approval> {
    this.rounds += 1;

    if (this.rounds > MAX_ROUNDS) return { approved: false, note: 'Out of tries: this is not what I asked for.' };

    if (!this.poser || !this.rollouts.length) return { approved: false, note: 'That is not what I asked for.' };

    for (const rollout of this.rollouts) {
      const verdict = await builderVerdict(this.poser, rollout, proposal);

      if (verdict !== rollout.pass) {
        const note = rollout.pass ? 'This one should pass.' : 'This one should fail.';

        return { approved: false, note, rollout: { dt: rollout.dt, qpos: rollout.qpos }, shouldPass: rollout.pass };
      }
    }

    this.approvedHash = contractHash(proposal.contract);

    return { approved: true };
  }
}
