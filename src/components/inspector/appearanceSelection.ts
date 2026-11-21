export const mixedAppearanceOption = { value: 'mixed', label: 'Mixed', disabled: true };

export const sharedAppearanceValue = <T>(values: T[]): T | null =>
  values.every((value) => value === values[0]) ? values[0] : null;
