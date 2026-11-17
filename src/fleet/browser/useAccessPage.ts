import { useEffect, useState } from 'react';
import { useAccessRequest } from './accessSession';
import type { AccessPage, AccessResource } from './accessTypes';

export function useAccessPage<T = AccessResource>(path: string, version = 0) {
  const request = useAccessRequest();
  const key = `${path}:${version}`;
  const [loaded, setLoaded] = useState<{ key: string; page: AccessPage<T>; error: string } | null>(null);

  useEffect(() => {
    let active = true;

    void request<AccessPage<T>>(path)
      .then((page) => {
        if (active) setLoaded({ key, page, error: '' });
      })
      .catch(() => {
        if (active) setLoaded({ key, page: { items: [], next: null }, error: 'Check your Fleet credentials.' });
      });

    return () => {
      active = false;
    };
  }, [path, key, request]);

  return {
    page: loaded?.key === key ? loaded.page : { items: [], next: null },
    busy: loaded?.key !== key,
    error: loaded?.key === key ? loaded.error : '',
  };
}
