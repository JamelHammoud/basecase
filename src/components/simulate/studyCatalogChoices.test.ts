import { describe, expect, it } from 'vitest';
import { actuatorOf, COMPONENTS, COMPONENT_BY_ID, type ComponentInfo } from '../../data/components';
import { addCatalogChoice, catalogServoChoices } from './studyCatalogChoices';

describe('Study servo choices', () => {
  it('offers every single-version and variant actuator accepted by the Study engine', () => {
    const offered = new Set(catalogServoChoices().map((choice) => choice.value));

    for (const component of COMPONENTS) {
      const versions = component.variants?.length ? component.variants.map((variant) => variant.id) : [undefined];

      for (const variant of versions) {
        const key = `component:${component.id}${variant ? `|${variant}` : ''}`;

        expect(offered.has(key)).toBe(!!actuatorOf(component.id, variant));
      }
    }
  });

  it('offers other servo families alongside the versions of the current family', () => {
    const choices = catalogServoChoices();

    expect(choices.map((choice) => choice.value)).toEqual(
      expect.arrayContaining([
        'component:feetech-sts3215|c001',
        'component:feetech-sts3215|c044',
        'component:feetech-sts3250',
        'component:dynamixel-xl430-w250',
      ]),
    );
    expect(choices.find((choice) => choice.value === 'component:feetech-sts3250')?.label).toContain('STS3250');
  });

  it('offers an actuator without a price or feedback bus and omits components without actuators', () => {
    const unpriced: ComponentInfo = {
      ...COMPONENT_BY_ID['feetech-sts3250'],
      id: 'unpriced-pwm',
      variants: undefined,
      actuator: { ...COMPONENT_BY_ID['feetech-sts3250'].actuator!, bus: 'pwm' },
    };
    const structural: ComponentInfo = { ...unpriced, id: 'passive', actuator: undefined };

    expect(catalogServoChoices([unpriced, structural]).map((choice) => choice.value)).toEqual([
      'component:unpriced-pwm',
    ]);
  });

  it('selects an added family while keeping previous values and avoiding repeated choices', () => {
    const original = ['component:feetech-sts3215|c001', 'component:feetech-sts3215|c044'];
    const chosen = addCatalogChoice(original, 'component:dynamixel-xl430-w250');

    expect(chosen).toEqual([...original, 'component:dynamixel-xl430-w250']);
    expect(original).toHaveLength(2);
    expect(addCatalogChoice(chosen, 'component:dynamixel-xl430-w250')).toEqual(chosen);
  });
});
