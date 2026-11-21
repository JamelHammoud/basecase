import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { fleetRequest } from './client';
import { facilityRevision, prepareFacilityRequest } from './facilityClient';
import type { FacilityResult } from './facilityClient';
import type { FacilityOptions } from '../sites/facilityTypes';
import type { Registration } from '../sites/registration.mjs';

export function useFacility(org: string, site: string, revision?: string, registration?: Registration | null) {
  const active = useRef<AbortController | null>(null);
  const [value, setValue] = useState<FacilityResult | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const path = `${org}/site/${site}/facility`;
  const registrationRevision = JSON.stringify(registration ?? null);

  const currentRevision = useEffectEvent(() => facilityRevision(value?.facility));

  useEffect(() => {
    const controller = new AbortController();

    active.current = controller;

    const unchanged = Boolean(revision && currentRevision() === revision);
    const pending = unchanged
      ? fleetRequest<Omit<FacilityResult, 'geometry'>>(path, { signal: controller.signal }).then((metadata) => ({
          metadata,
        }))
      : prepareFacilityRequest({ path: `/v1/${path}`, operation: 'load' }, controller.signal).then((loaded) => ({
          loaded,
        }));

    void pending
      .then((result) => {
        if (controller.signal.aborted) return;

        setBusy(false);

        if ('loaded' in result) {
          setValue(result.loaded);
          setVersion((value) => value + 1);

          return;
        }

        setValue((current) =>
          current &&
          current.facility?.hash === result.metadata.facility?.hash &&
          current.facility?.revision === result.metadata.facility?.revision
            ? { ...current, registration: result.metadata.registration }
            : current,
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;

        setBusy(false);
        setError(true);
      });

    return () => {
      controller.abort();
      active.current?.abort();
    };
  }, [path, revision, registrationRevision]);

  async function upload(files: File[], options: FacilityOptions) {
    active.current?.abort();

    const controller = new AbortController();

    active.current = controller;
    setBusy(true);
    setError(false);

    try {
      const loaded = await prepareFacilityRequest(
        { path: `/v1/${path}`, operation: 'import', files, options },
        controller.signal,
      );

      if (controller.signal.aborted) return false;

      setValue(loaded);
      setVersion((value) => value + 1);

      return true;
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (active.current === controller) setBusy(false);
    }

    return false;
  }

  return {
    value,
    error,
    busy,
    version,
    upload,
    path,
    setRegistration(registration: Registration, revision: string) {
      setValue((current) =>
        current && facilityRevision(current.facility) === revision ? { ...current, registration } : current,
      );
    },
  };
}
