import { COMPONENTS, type ComponentInfo } from '../../data/components';

function choicesOf(component: ComponentInfo) {
  if (component.variants?.length)
    return component.variants
      .filter((variant) => variant.actuator)
      .map((variant) => ({
        value: `component:${component.id}|${variant.id}`,
        label: `${component.name} ${variant.label}`,
      }));

  return component.actuator ? [{ value: `component:${component.id}`, label: component.name }] : [];
}

export function catalogServoChoices(components: readonly ComponentInfo[] = COMPONENTS) {
  return components.flatMap(choicesOf).sort((a, b) => a.label.localeCompare(b.label));
}

export function addCatalogChoice(values: string[], value: string): string[] {
  return !value || values.includes(value) ? values : [...values, value];
}
