import { parseCase, type Case, type WorldObject } from './schema';
import { uniqueCaseId } from './caseBuilder';
import { MAX_PEOPLE } from './personEncounter';
import { refuse } from './validate';
import { contractReads } from './contractReads';

const CONTACT_SUFFIX = '-contact';
const contactSignal = (id: string) => `${id}${CONTACT_SUFFIX}`;
const contactLabel = (name: string) => `Contact with ${name}`;

function isPersonFailure(failure: Case['task']['contract']['failures'][number], id: string) {
  const formula = failure.formula;

  if (!('eventually' in formula) || formula.eventually.window !== 'whole') return false;

  const state = formula.eventually.state;

  if (!('atom' in state) || !('signal' in state.atom.expr)) return false;

  return (
    state.atom.expr.signal === contactSignal(id) &&
    state.atom.cmp === '>' &&
    state.atom.value === 0.5 &&
    state.atom.scale === 1
  );
}

export function addPerson(kase: Case): Case {
  const people = kase.world.objects.filter((object) => object.person);

  if (people.length >= MAX_PEOPLE) refuse('world', `holds more than ${MAX_PEOPLE} people`);

  const signals = [...kase.task.probes.map((probe) => probe.signal), ...contractReads(kase.task.contract)];
  const reserved = signals.flatMap((signal) =>
    signal.endsWith(CONTACT_SUFFIX) ? [signal.slice(0, -CONTACT_SUFFIX.length)] : [],
  );
  const id = uniqueCaseId('person', [...kase.world.objects.map((object) => object.id), ...reserved]);
  const target = kase.reference.timeline.find((command) => command.target)?.target;
  const z = (target?.[2] ?? -2000) / 2;
  const position: WorldObject['position'] = [-1000, 850, z];
  const person: WorldObject = {
    id,
    name: id === 'person' ? 'Person 1' : `Person ${id.slice(7)}`,
    kind: 'box',
    position,
    rotation: [0, 0, 0],
    size: [500, 1700, 300],
    color: '#888888',
    behavior: 'static',
    movable: true,
    person: {
      speedMmS: 1000,
      startSeconds: 2,
      route: [
        { position, pauseSeconds: 0 },
        { position: [1000, 850, z], pauseSeconds: 0 },
      ],
    },
  };
  const signal = contactSignal(id);

  return parseCase({
    ...kase,
    world: { ...kase.world, objects: [...kase.world.objects, person] },
    task: {
      ...kase.task,
      probes: [...kase.task.probes, { signal, from: 'base', to: { object: id }, kind: 'contact' }],
      contract: {
        ...kase.task.contract,
        failures: [
          ...kase.task.contract.failures,
          {
            label: contactLabel(person.name),
            formula: {
              eventually: { window: 'whole', state: { atom: { expr: { signal }, cmp: '>', value: 0.5, scale: 1 } } },
            },
          },
        ],
      },
    },
  });
}

export function replacePerson(kase: Case, person: WorldObject): Case {
  if (!kase.world.objects.some((object) => object.id === person.id && object.person))
    refuse(person.id, 'isn’t a person in this Case');

  return parseCase({
    ...kase,
    world: { ...kase.world, objects: kase.world.objects.map((object) => (object.id === person.id ? person : object)) },
  });
}

export function removePerson(kase: Case, id: string): Case {
  const person = kase.world.objects.find((object) => object.id === id && object.person);

  if (!person) return kase;

  const guard = kase.task.contract.failures.findIndex((failure) => isPersonFailure(failure, id));

  return parseCase({
    ...kase,
    world: { ...kase.world, objects: kase.world.objects.filter((object) => object.id !== id) },
    task: {
      ...kase.task,
      probes: kase.task.probes.filter((probe) => probe.signal !== contactSignal(id)),
      contract: {
        ...kase.task.contract,
        failures: kase.task.contract.failures.filter((_, index) => index !== guard),
      },
    },
  });
}
