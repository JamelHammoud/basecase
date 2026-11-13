import { describe, expect, it } from 'vitest';
import { NO_KEYS } from '../../electron/onshape/index.mjs';
import { settingsPaneIn, withoutSettingsPath } from './settingsPanes';

const KEYS_REFUSED = 'Onshape didn’t accept the API keys in Settings ▸ Accounts.';
const TOKEN_REFUSED = 'Hugging Face didn’t accept the access token in Settings ▸ Accounts.';

describe('settingsPaneIn', () => {
  it('finds the pane an error sends the person to', () => {
    expect(settingsPaneIn(NO_KEYS)).toBe('accounts');
    expect(settingsPaneIn(`Couldn’t publish the dataset. ${TOKEN_REFUSED}`)).toBe('accounts');
    expect(settingsPaneIn('Add the printer in Settings ▸ Printers.')).toBe('printers');
  });

  it('leaves a printer’s own settings and unknown panes alone', () => {
    expect(settingsPaneIn('Check the access code on the printer: Settings → LAN Only.')).toBeNull();
    expect(settingsPaneIn('Find it in Settings ▸ Network.')).toBeNull();
  });
});

describe('withoutSettingsPath', () => {
  it('drops the path inside the pane it names', () => {
    expect(withoutSettingsPath(KEYS_REFUSED)).toBe('Onshape didn’t accept the API keys.');
    expect(withoutSettingsPath(TOKEN_REFUSED)).toBe('Hugging Face didn’t accept the access token.');
  });
});
