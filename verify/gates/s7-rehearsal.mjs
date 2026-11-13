import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';
import { cleanRerun } from '../rehearsal/cleanRerun.mjs';

const CANARIES = 'verify/rehearsal/canaries.test.ts';
const UNSIGNED = { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } };

export default {
  id: 's7-rehearsal',
  stage: 7,
  title: 'Stage 7: dress rehearsal, PersonaLab recall, mechanised UI rules, every required gate from a clean checkout',
  state: 'required',
  checks: [
    vitestCheck(
      'mechanised UI rules on every view: 32px controls (28px icon-only), 12px type, neutral greys, copy lint, axe',
      'verify/rehearsal/uiRules.test.ts',
    ),
    shCheck('the app bundles', 'npx', ['vite', 'build']),
    shCheck(
      'an unsigned app packages',
      'npx',
      ['electron-builder', '--dir', '--publish', 'never', '-c.mac.forceCodeSigning=false'],
      UNSIGNED,
    ),
    vitestCheck(
      'PersonaLab scoring matches a moved control and a name read with spaces, and nothing else',
      'verify/rehearsal/personaScore.test.ts',
    ),
    {
      ...vitestCheck(
        'PersonaLab, with only the screen and accessibility tree, finds 80% of 30 planted usability faults, half its findings on target',
        'verify/rehearsal/persona.test.ts',
      ),
      timed: true,
    },
    cleanRerun,
  ],
  canaries: [
    vitestCanary('a 20px input is caught', CANARIES, 'canary small control: a 20px input passes the control check'),
    vitestCanary('10px text is caught', CANARIES, 'canary small type: 10px text passes the type check'),
    vitestCanary('a blue-tinted grey is caught', CANARIES, 'canary tinted grey: a slate card passes the grey check'),
    vitestCanary('banned copy is caught', CANARIES, 'canary banned copy: “No parts yet” passes the copy lint'),
    vitestCanary(
      'a silent persona misses the recall bar',
      CANARIES,
      'canary silent persona: a persona that reports nothing meets the recall bar',
    ),
    vitestCanary(
      'a persona that flags everything misses the precision bar',
      CANARIES,
      'canary shotgun persona: a persona that flags everything meets the precision bar',
    ),
    vitestCanary(
      'a voided gate is not green',
      CANARIES,
      'canary void counted green: a voided required gate passes the rehearsal',
    ),
    vitestCanary(
      'a parked gate needs a reason',
      CANARIES,
      'canary silent park: a parked gate with no reason passes the rehearsal',
    ),
  ],
};
