import React, { useEffect, useState } from 'react';
import { hubBridge, type HubAccountState } from '../../hub/hubBridge';
import { onshapeBridge, type OnshapeAccountState, type OnshapeKey } from '../../onshape/onshapeBridge';
import { SettingsGroup as Group } from '../SettingsRows';
import { SecretField } from './SecretField';
import { errorMessage } from '../../utils/errorMessage';
import { withoutSettingsPath, type SettingsField } from '../../app/settingsPanes';
import { earthBridge, type EarthAccountState } from '../../earth/earthBridge';

const HUB_SIGNED_OUT: HubAccountState = { signedIn: false, name: null };
const ONSHAPE_SIGNED_OUT: OnshapeAccountState = { access: false, secret: false, name: null, error: null };

const paneError = (e: unknown) => withoutSettingsPath(errorMessage(e));

export const AccountsPane: React.FC<{ field?: SettingsField }> = ({ field }) => {
  const [hub, setHub] = useState<HubAccountState>(HUB_SIGNED_OUT);
  const [hubError, setHubError] = useState<string | null>(null);
  const [onshape, setOnshape] = useState<OnshapeAccountState>(ONSHAPE_SIGNED_OUT);
  const [onshapeErrors, setOnshapeErrors] = useState<Partial<Record<OnshapeKey, string>>>({});
  const [maps, setMaps] = useState<EarthAccountState>({ saved: false });
  const [mapsError, setMapsError] = useState<string | null>(null);

  useEffect(() => {
    hubBridge
      .account()
      .then(setHub)
      .catch(() => {});
    onshapeBridge
      .account()
      .then(setOnshape)
      .catch(() => {});
    earthBridge
      .account()
      .then(setMaps)
      .catch(() => {});
  }, []);

  const signIn = async (token: string) => {
    try {
      setHub(await hubBridge.signIn(token));
      setHubError(null);
    } catch (e) {
      setHubError(paneError(e));

      throw e;
    }
  };

  const saveMapKey = async (key: string) => {
    try {
      setMaps(await earthBridge.setKey(key));
      setMapsError(null);
    } catch (e) {
      setMapsError(paneError(e));

      throw e;
    }
  };

  const saveOnshape = (kind: OnshapeKey) => async (value: string) => {
    try {
      setOnshape(await onshapeBridge.setKey(kind, value));
      setOnshapeErrors({});
    } catch (e) {
      setOnshapeErrors({ [kind]: paneError(e) });
      setOnshape(await onshapeBridge.account().catch(() => onshape));

      throw e;
    }
  };

  return (
    <>
      <Group title="Hugging Face">
        <SecretField
          label="Access token"
          saved={hub.signedIn}
          savedHint={hub.name}
          error={hubError}
          onSecret={signIn}
        />
      </Group>
      <Group title="Onshape">
        <SecretField
          label="Access key"
          saved={onshape.access}
          error={onshapeErrors.access}
          onSecret={saveOnshape('access')}
        />
        <SecretField
          label="Secret key"
          saved={onshape.secret}
          savedHint={onshape.name ?? undefined}
          error={
            onshapeErrors.secret ??
            (onshapeErrors.access ? undefined : onshape.error && withoutSettingsPath(onshape.error))
          }
          onSecret={saveOnshape('secret')}
        />
      </Group>
      <Group title="Google Maps">
        <SecretField
          label="Map Tiles key"
          saved={maps.saved}
          error={mapsError}
          autoFocus={field === 'map-tiles'}
          onSecret={saveMapKey}
        />
      </Group>
    </>
  );
};
