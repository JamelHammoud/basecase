import { useEffect, useRef, useState } from 'react';
import { fleetRequest, type RegistryPage } from './client';

const EMPTY: RegistryPage = { items: [], next: null };

export function useInventory(org: string) {
  const accessGeneration = useRef(0);
  const accessBlocked = useRef(false);
  const [sites, setSites] = useState(EMPTY);
  const [robots, setRobots] = useState(EMPTY);
  const [site, setSite] = useState('');
  const [siteAfter, setSiteAfter] = useState('');
  const [robotAfter, setRobotAfter] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (accessBlocked.current) return;

    let active = true;
    const generation = accessGeneration.current;
    const query = new URLSearchParams({ after: robotAfter, site });

    Promise.all([
      fleetRequest<RegistryPage>(`${org}/site?after=${siteAfter}`),
      fleetRequest<RegistryPage>(`${org}/robot?${query}`),
    ])
      .then(([nextSites, nextRobots]) => {
        if (!active || generation !== accessGeneration.current) return;

        setSites(nextSites);
        setRobots(nextRobots);
        setError(false);
      })
      .catch(() => {
        if (!active || generation !== accessGeneration.current) return;

        accessBlocked.current = true;
        accessGeneration.current += 1;
        setSites(EMPTY);
        setRobots(EMPTY);
        setError(true);
      });

    return () => {
      active = false;
    };
  }, [org, site, siteAfter, robotAfter, revision]);

  useEffect(() => {
    const stream = new EventSource(`/v1/${org}/subscribe`);
    const reset = () => {
      stream.close();
      accessBlocked.current = true;
      accessGeneration.current += 1;
      setSites(EMPTY);
      setRobots(EMPTY);
      setError(true);
    };

    stream.addEventListener('snapshot', () => setRevision((value) => value + 1));
    stream.addEventListener('reset', reset);
    stream.onerror = reset;

    return () => stream.close();
  }, [org]);

  return {
    sites,
    robots,
    site,
    error,
    chooseSite(value: string) {
      setSite(value);
      setRobotAfter('');
    },
    nextSites() {
      setSiteAfter(sites.next ?? '');
      setSite('');
      setRobotAfter('');
    },
    nextRobots() {
      setRobotAfter(robots.next ?? '');
    },
  };
}
