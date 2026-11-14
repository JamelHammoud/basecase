import React, { useEffect, useState } from 'react';
import { printBridge, type ServiceStatus } from '../../print/printBridge';
import { withoutSettingsPath } from '../../app/settingsPanes';
import { errorMessage } from '../../utils/errorMessage';
import { SettingsGroup as Group } from '../SettingsRows';
import { SecretField } from './SecretField';

const NO_SERVICE: ServiceStatus = { name: 'Slant 3D', hasKey: false };

export const PrintServiceAccount: React.FC = () => {
  const [service, setService] = useState<ServiceStatus>(NO_SERVICE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    printBridge
      .service()
      .then(setService)
      .catch(() => {});
  }, []);

  const save = async (key: string) => {
    try {
      setService(await printBridge.setServiceKey(key));
      setError(null);
    } catch (e) {
      setError(withoutSettingsPath(errorMessage(e)));

      throw e;
    }
  };

  return (
    <Group title={service.name}>
      <SecretField label="API key" saved={service.hasKey} error={error} onSecret={save} />
    </Group>
  );
};
