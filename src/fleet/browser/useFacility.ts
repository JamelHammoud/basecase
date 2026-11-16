import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { fleetRequest } from './client';
import { prepareFacilityRequest } from './facilityClient';
import type { FacilityResult } from './facilityClient';
import type { FacilityOptions } from '../sites/facilityTypes';
import type { Registration } from '../sites/registration.mjs';

export function useFacility(org: string, site: string, revision?: string) {
  const active = useRef<AbortController | null>(null);
  const [value, setValue] = useState<FacilityResult | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const path = `${org}/site/${site}/facility`;

  const currentHash = useEffectEvent(() => value?.facility?.hash);

  useEffect(() => {
    const controller = new AbortController();

    active.current = controller;

    if (!site || (revision && currentHash() === revision)) return () => controller.abort();

    void fleetRequest<Omit<FacilityResult, 'geometry'>>(path, { signal: controller.signal })
      .then(async (metadata) => {
        if (!metadata.facility) return;

        const loaded = await prepareFacilityRequest({ path: `/v1/${path}`, operation: 'load' }, controller.signal);

        if (!controller.signal.aborted) setValue({ ...metadata, ...loaded });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });

    return () => controller.abort();
  }, [path, site, revision]);

  async function upload(files: File[], options: FacilityOptions) {
    const controller = active.current;

    if (!controller || controller.signal.aborted) return false;

    setBusy(true);
    setError(false);

    try {
      const loaded = await prepareFacilityRequest(
        { path: `/v1/${path}`, operation: 'import', files, options },
        controller.signal,
      );

      if (controller.signal.aborted) return false;

      setValue(loaded);
      setBusy(false);

      return true;
    } catch {
      setError(true);
    }

    setBusy(false);

    return false;
  }

  return {
    value,
    error,
    busy,
    upload,
    path,
    setRegistration(registration: Registration) {
      setValue((current) => (current ? { ...current, registration } : current));
    },
  };
}
