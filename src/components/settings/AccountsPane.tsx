import React, { useEffect, useState } from 'react';
import { hubBridge, type HubAccountState } from '../../hub/hubBridge';
import { SettingsGroup as Group } from '../SettingsRows';
import { SecretField } from './SecretField';

const SIGNED_OUT: HubAccountState = { signedIn: false, name: null };

export const AccountsPane: React.FC = () => {
  const [account, setAccount] = useState<HubAccountState>(SIGNED_OUT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hubBridge
      .account()
      .then(setAccount)
      .catch(() => {});
  }, []);

  const signIn = async (token: string) => {
    try {
      setAccount(await hubBridge.signIn(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));

      throw e;
    }
  };

  return (
    <Group title="Hugging Face">
      <SecretField
        label="Access token"
        saved={account.signedIn}
        savedHint={account.name}
        error={error}
        onSecret={signIn}
      />
    </Group>
  );
};
