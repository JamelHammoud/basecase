import React, { useEffect, useState } from 'react';
import { onshapeBridge, type OnshapeAccountState, type OnshapeKey } from '../../onshape/onshapeBridge';
import { SettingsGroup as Group } from '../SettingsRows';
import { SecretField } from './SecretField';

const SIGNED_OUT: OnshapeAccountState = { access: false, secret: false, name: null };

export const AccountsPane: React.FC = () => {
  const [account, setAccount] = useState<OnshapeAccountState>(SIGNED_OUT);
  const [errors, setErrors] = useState<Partial<Record<OnshapeKey, string>>>({});

  useEffect(() => {
    onshapeBridge
      .account()
      .then(setAccount)
      .catch(() => {});
  }, []);

  const save = (kind: OnshapeKey) => async (value: string) => {
    try {
      setAccount(await onshapeBridge.setKey(kind, value));
      setErrors({});
    } catch (e) {
      setErrors({ [kind]: e instanceof Error ? e.message : String(e) });
      setAccount(await onshapeBridge.account().catch(() => account));
    }
  };

  return (
    <Group title="Onshape">
      <SecretField label="Access key" saved={account.access} error={errors.access} onSecret={save('access')} />
      <SecretField
        label="Secret key"
        saved={account.secret}
        savedHint={account.name ?? undefined}
        error={errors.secret}
        onSecret={save('secret')}
      />
    </Group>
  );
};
