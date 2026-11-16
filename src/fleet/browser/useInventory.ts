import { useEffect, useRef, useState } from 'react';
import { fleetRequest, type RegistryPage } from './client';

const EMPTY: RegistryPage = { items: [], next: null };

export function useInventory(org: string) {
  const accessGeneration = useRef(0);
  const [sites, setSites] = useState(EMPTY);
  const [robots, setRobots] = useState(EMPTY);
  const [site, setSite] = useState('');
  const [siteAfter, setSiteAfter] = useState('');
  const [robotAfter, setRobotAfter] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
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
        setError('');
      })
      .catch(() => {
        if (active && generation === accessGeneration.current) setError('Reload Fleet to check access.');
      });

    return () => {
      active = false;
    };
  }, [org, site, siteAfter, robotAfter, revision]);

  useEffect(() => {
    const stream = new EventSource(`/v1/${org}/subscribe`);
    const reset = () => {
      stream.close();
      accessGeneration.current += 1;
      setSites(EMPTY);
      setRobots(EMPTY);
      setError('Reload Fleet to check access.');
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
