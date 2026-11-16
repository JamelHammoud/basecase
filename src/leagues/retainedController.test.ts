import { expect, it } from 'vitest';
import { galleryBundleBytes } from '../gallery/galleryBundle';
import { galleryBundles } from '../gallery/galleryEntries';
import { currentDesign, skillFromTraining } from '../skills/artifacts';
import { fixtureModel } from '../skills/fixtureModels';
import { kitEnvironment } from '../skills/kitEnvironment';
import { designOf } from '../skills/skillsRuntime';
import { skillRecord } from '../skills/skillRecords';
import { roverLeagueFixture } from './fixtures';
import { hashBytes, hashValue, verifyEntryBundle } from './validation';

it('refuses a retained controller the League runner cannot replay before accepting the entry', () => {
  const bundle = galleryBundles().find((candidate) => candidate.slug === 'hexapod-reach-the-flag')!;
  const model = fixtureModel('hexapod');
  const environment = kitEnvironment(model, 'stand');
  const skill = skillFromTraining({
    name: 'Stand',
    start: null,
    current: currentDesign({ design: designOf(model), model, environment }),
    environment,
    controller: { kind: 'hold' },
  });

  bundle.trained = { kind: 'skill', record: skillRecord(skill, { kit: 'stand' }), skill };

  const { manifest, entries } = roverLeagueFixture();
  const pinned = {
    ...manifest,
    case: bundle.case,
    caseHash: hashValue(bundle.case),
    contractHash: hashValue(bundle.case.task.contract),
  };
  const bytes = galleryBundleBytes(bundle);
  const entry = { ...entries[0], robotName: bundle.robot.name, bundleHash: hashBytes(bytes) };

  expect(() => verifyEntryBundle(pinned, entry, bytes)).toThrow('unsupported controller');
});
