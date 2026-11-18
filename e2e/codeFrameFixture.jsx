import React from 'react';
import { createRoot } from 'react-dom/client';
import { createSignalBus } from '../src/cases/console/signalBus';
import { CodeFrame } from '../src/components/caseRun/code/CodeFrame';

const ctx = {
  bus: createSignalBus(),
  scope: { declared: new Set(), probes: new Set(), inputs: new Set() },
  inputs: [],
  studio: null,
};

createRoot(document.getElementById('root')).render(
  <CodeFrame
    panel={{ id: 'spin', kind: 'code', title: 'Spin', source: '<script>while (true) {}</script>' }}
    ctx={ctx}
    pointer
    className=""
  />,
);
