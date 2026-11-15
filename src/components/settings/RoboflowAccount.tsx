import React, { useEffect, useState } from 'react';
import { roboflowBridge } from '../../roboflow/roboflowBridge';
import { errorMessage } from '../../utils/errorMessage';
import { withoutSettingsPath, type SettingsFocus } from '../../app/settingsPanes';
import { SettingsGroup } from '../SettingsRows';
import { SecretField } from './SecretField';

export const RoboflowAccount: React.FC<{ focus?: SettingsFocus }> = ({ focus }) => {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roboflowBridge
      .account()
      .then((account) => setSaved(account.saved))
      .catch(() => {});
  }, []);

  const save = async (key: string) => {
    try {
      setSaved((await roboflowBridge.setKey(key)).saved);
      setError(null);
    } catch (e) {
      setError(withoutSettingsPath(errorMessage(e)));

      throw e;
    }
  };

  return (
    <SettingsGroup title="Roboflow">
      <SecretField
        label="Roboflow API key"
        saved={saved}
        error={error}
        focusAsk={focus?.field === 'roboflow' ? focus.ask : undefined}
        onSecret={save}
      />
    </SettingsGroup>
  );
};
