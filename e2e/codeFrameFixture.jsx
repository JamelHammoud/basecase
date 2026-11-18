import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { CodeCockpitFixture } from './codeCockpitFixture';
import { createSignalBus } from '../src/cases/console/signalBus';
import { CodeFrame } from '../src/components/caseRun/code/CodeFrame';

const ctx = {
  bus: createSignalBus(),
  scope: { declared: new Set(), probes: new Set(), inputs: new Set() },
  inputs: [],
  studio: null,
};

createRoot(document.getElementById('root')).render(
  location.search === '?cockpit' ? (
    <CodeCockpitFixture />
  ) : (
    <CodeFrame
      panel={{ id: 'spin', kind: 'code', title: 'Spin', source: '<script>while (true) {}</script>' }}
      ctx={ctx}
      pointer
      className=""
    />
  ),
);
