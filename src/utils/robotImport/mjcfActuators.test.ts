import { describe, expect, it } from 'vitest';
import { parseMjcf } from './mjcf';
import { parseXml } from './robotImport.fixtures';

function model(body: string, actuators = '', defaults = '') {
  return parseXml(`<mujoco model="actuators">${defaults}
    <worldbody><body name="base">${body}</body></worldbody>${actuators}</mujoco>`);
}

describe('MJCF actuator attachment', () => {
  it('keeps source order, passive joints, class defaults and the first nonzero effort', () => {
    const doc = model(
      `<body name="arm"><joint name="hinge" actuatorfrcrange="-4 6"/>
        <joint name="slide" type="slide"/><joint name="motor"/><joint name="passive" damping="2"/>
        <joint name="zero"/><joint name="unbounded"/></body>`,
      `<actuator><motor joint="hinge" ctrlrange="-100 100"/>
        <position joint="slide"/><position joint="slide" class="drive"/>
        <motor joint="motor" ctrlrange="-2 3" gear="4"/>
        <motor joint="zero" ctrlrange="0 0"/>
        <position joint="unbounded"/><motor joint="missing" ctrlrange="-9 9"/></actuator>
       <actuator><motor joint="slide" ctrlrange="-99 99"/>
        <motor joint="zero" ctrlrange="-5 5" gear="0"/></actuator>`,
      '<default><default class="drive"><position forcerange="-7 5"/></default></default>',
    );
    const joints = parseMjcf(doc).joints;

    expect(joints.map((j) => [j.name, j.type, j.actuation, j.effort])).toEqual([
      ['hinge', 'revolute', 'powered', 6],
      ['slide', 'prismatic', 'powered', 7],
      ['motor', 'revolute', 'powered', 12],
      ['passive', 'revolute', 'passive', undefined],
      ['zero', 'revolute', 'powered', 5],
      ['unbounded', 'revolute', 'powered', undefined],
    ]);
    expect(joints[3].damping).toBe(2);
    expect(joints[1].after).toBe(joints[0]);
  });

  it('keeps the first duplicate match and distinguishes absent names from empty names', () => {
    const doc = model(
      `<body name="first"><joint name="duplicate"/><joint name=""/></body>
       <body name="second"><joint name="duplicate"/></body><body name="fixed"/>`,
      `<actuator><motor forcerange="-99 99"/>
        <motor joint="duplicate" forcerange="-3 3"/>
        <motor joint="fixed_fixed" forcerange="-8 8"/></actuator>`,
    );

    expect(parseMjcf(doc).joints.map((j) => [j.name, j.actuation, j.effort])).toEqual([
      ['duplicate', 'powered', 3],
      ['', 'passive', undefined],
      ['duplicate', 'passive', undefined],
      ['fixed_fixed', 'powered', 8],
    ]);

    const withEmptyName = model(
      '<body name="empty"><joint name=""/></body>',
      '<actuator><motor joint="" forcerange="-2 2"/></actuator>',
    );

    expect(parseMjcf(withEmptyName).joints[0]).toMatchObject({ name: '', actuation: 'powered', effort: 2 });
    expect(parseMjcf(model('')).joints).toEqual([]);
  });

  it('attaches reversed actuator lists across wide models and rebuilds after document edits', () => {
    for (const count of [300, 600]) {
      const bodies = Array.from(
        { length: count },
        (_, i) => `<body name="body_${i}"><joint name="joint_${i}"/></body>`,
      ).join('');
      const motors = Array.from(
        { length: count },
        (_, i) => `<motor joint="joint_${count - i - 1}" forcerange="-${i + 1} ${i + 1}"/>`,
      ).join('');
      const doc = model(bodies, `<actuator>${motors}</actuator>`);
      const before = parseMjcf(doc);
      const actuator = doc.documentElement.children[1].children[0];
      const attribute = actuator.getAttribute.bind(actuator);

      actuator.getAttribute = (name) => (name === 'joint' ? 'joint_0' : attribute(name));

      const after = parseMjcf(doc);

      expect(before.joints.map((j) => [j.name, j.effort])).toEqual(
        Array.from({ length: count }, (_, i) => [`joint_${i}`, count - i]),
      );
      expect(after.joints[0].effort).toBe(1);
      expect(after.joints[count - 1]).toMatchObject({ actuation: 'passive', effort: undefined });
      expect(before.joints[count - 1]).toMatchObject({ actuation: 'powered', effort: 1 });
    }
  });
});
