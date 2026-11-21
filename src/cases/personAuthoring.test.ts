import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { addPerson, replacePerson, removePerson } from './personAuthoring';
import { presetCase } from './testing';
import { contractReads } from './contractReads';
import { parseCase } from './schema';

const robot = fixtureRobots().find((r) => r.id === 'rover-diff')!;

describe('ordinary Case person authoring', () => {
  it('adds independently identified people and contact failures without changing the original goal', () => {
    const source = presetCase(robot, 'reach-the-flag');
    const one = addPerson(source);
    const two = addPerson(one);
    const people = two.world.objects.filter((o) => o.person);

    expect(people).toHaveLength(2);
    expect(new Set(people.map((o) => o.id)).size).toBe(2);
    expect(two.task.contract.success).toEqual(source.task.contract.success);
    expect(two.task.probes.filter((p) => p.kind === 'contact').map((p) => p.from)).toEqual(['base', 'base']);
    expect(two.task.contract.failures).toHaveLength(source.task.contract.failures.length + 2);
    expect([...contractReads(two.task.contract)]).toContain(`${people[0].id}-contact`);
    expect(parseCase(two)).toEqual(two);
    expect(source.world.objects.some((o) => o.person)).toBe(false);
  });

  it('edits retained world declarations and removes only the matching person and guard', () => {
    const source = presetCase(robot, 'reach-the-flag');
    const made = addPerson(addPerson(source));
    const object = made.world.objects.find((o) => o.person)!;
    const edited = replacePerson(made, { ...object, person: { ...object.person!, startSeconds: 4 } });
    const removed = removePerson(edited, object.id);

    expect(edited.world.objects.find((o) => o.id === object.id)?.person?.startSeconds).toBe(4);
    expect(made.world.objects.find((o) => o.id === object.id)?.person?.startSeconds).toBe(2);
    expect(removed.world.objects.filter((o) => o.person)).toHaveLength(1);
    expect(removed.task.contract.success).toEqual(source.task.contract.success);
    expect(removed.task.contract.failures).toHaveLength(source.task.contract.failures.length + 1);
    expect(removed.task.probes.some((p) => p.signal === `${object.id}-contact`)).toBe(false);
  });

  it('refuses an encounter whose route cannot finish during the Case', () => {
    const kase = addPerson(presetCase(robot, 'reach-the-flag'));
    const person = kase.world.objects.find((object) => object.person)!;

    expect(() =>
      replacePerson(kase, { ...person, person: { ...person.person!, startSeconds: kase.task.seconds } }),
    ).toThrow();
  });

  it('keeps existing rules with a person contact label when deleting that person', () => {
    const base = presetCase(robot, 'reach-the-flag');
    const source = parseCase({
      ...base,
      task: {
        ...base.task,
        contract: {
          ...base.task.contract,
          failures: [
            ...base.task.contract.failures,
            { label: 'Contact with Person 1', formula: base.task.contract.success },
          ],
        },
      },
    });
    const made = addPerson(source);
    const person = made.world.objects.find((object) => object.person)!;

    expect(removePerson(made, person.id)).toEqual(source);
  });

  it('keeps existing probe identities when adding a contact channel', () => {
    const base = presetCase(robot, 'reach-the-flag');
    const source = parseCase({
      ...base,
      task: { ...base.task, probes: [...base.task.probes, { ...base.task.probes[0], signal: 'person-contact' }] },
    });
    const made = addPerson(source);

    expect(made.world.objects.find((object) => object.person)?.id).toBe('person-2');
    expect(made.task.probes.slice(0, source.task.probes.length)).toEqual(source.task.probes);
    expect(made.task.probes.at(-1)?.signal).toBe('person-2-contact');
    expect(made.task.contract.success).toEqual(source.task.contract.success);
  });
});
