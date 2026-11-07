import type { Resource, SkillContract, TransitionProof } from './schema';

export const FIXTURE_MODEL_HASH = 'fixture-kit';

const proof: TransitionProof = { seeds: 32, falls: 0, modelHash: FIXTURE_MODEL_HASH };

function contract(
  id: string,
  holds: Resource[],
  rest: Partial<SkillContract> & Pick<SkillContract, 'stopVia'>,
): SkillContract {
  return {
    id,
    status: 'ready',
    rateHz: 50,
    holds,
    startsFrom: ['standing'],
    endsIn: 'standing',
    interrupt: 'any',
    transitions: {},
    ...rest,
  };
}

export const FIXTURE_SKILLS: readonly SkillContract[] = [
  contract('walk', ['body'], {
    interrupt: 'atPhase',
    stopVia: 'settle',
    transitions: { settle: proof },
  }),
  contract('settle', ['body'], {
    stopVia: 'settle',
    startsFrom: ['standing', 'walking'],
    endsIn: 'standing',
    transitions: { walk: proof, 'turn-away': proof, wave: proof, sit: proof },
  }),
  contract('turn-away', ['body'], { stopVia: 'settle', transitions: { walk: proof, settle: proof } }),
  contract('wave', ['body'], { stopVia: 'settle', transitions: { walk: proof, settle: proof } }),
  contract('sit', ['body'], { stopVia: 'sit', endsIn: 'sitting' }),
  contract('look-at', ['head'], { stopVia: 'look-at' }),
  contract('backflip', ['body'], { status: 'needsTraining', stopVia: 'settle' }),
];
