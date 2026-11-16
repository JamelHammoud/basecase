import { useSyncExternalStore } from 'react';
import { boundedIncidents, FleetIncidents, readIncidents } from './fleetIncidents';
import type { RobotEvent } from './robotState';

let inspected: string | null = null;

const KEY = 'robot-fleet-incidents-v1';
const listeners = new Set<() => void>();

function load() {
  try {
    return readIncidents(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export const fleetIncidents = new FleetIncidents(load());

const snapshot = () => fleetIncidents.items;
const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

export function publishIncidents() {
  try {
    fleetIncidents.items = boundedIncidents(fleetIncidents.items);
    localStorage.setItem(KEY, JSON.stringify(fleetIncidents.items));
  } catch {
    return notify();
  }

  notify();
}

function notify() {
  for (const listener of listeners) listener();
}

export function collectFleetIncident(event: RobotEvent) {
  if (fleetIncidents.event(event, Date.now())) publishIncidents();
}

export function acknowledgeIncident(id: string) {
  if (fleetIncidents.acknowledge(id, Date.now())) publishIncidents();
}

export const useFleetIncidents = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export function inspectUnitProblems(unit: string | null) {
  inspected = unit;
  notify();
}

export const useInspectedUnit = () =>
  useSyncExternalStore(
    subscribe,
    () => inspected,
    () => inspected,
  );
