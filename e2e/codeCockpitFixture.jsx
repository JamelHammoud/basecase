import React, { useState } from 'react';
import { consoleLayout } from '../src/cases/console/layout';
import { createSignalBus } from '../src/cases/console/signalBus';
import { CodeFrame } from '../src/components/caseRun/code/CodeFrame';
import { CodeOverlays } from '../src/components/caseRun/code/CodeOverlays';
import { useDriveKeys } from '../src/workspace/useDriveKeys';
import { useWorkspaceKeys } from '../src/workspace/useWorkspaceKeys';
import { COCKPIT } from './codePanelSources';

const layout = consoleLayout(COCKPIT, { desktop: true, studio: true });
const bus = createSignalBus();

export function CodeCockpitFixture() {
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(true);
  const [clicks, setClicks] = useState(0);
  const drive = {
    active,
    cls: null,
    stop: () => setActive(false),
    setKeys: () => undefined,
  };
  const ctx = {
    bus,
    scope: { declared: new Set(), probes: new Set(), inputs: new Set(COCKPIT.input) },
    inputs: COCKPIT.input,
    studio: null,
    can: (action) => action === 'drive',
    fire: () => setActive(true),
  };

  useWorkspaceKeys({
    active: true,
    core: {
      tool: { marking: false },
      studio: { settingsOpen: false },
      simTraining: { sim: { drive } },
      buildAlong: { active: false },
      caseRun: { open, leave: () => setOpen(false) },
    },
    ui: { paletteOpen: false },
    actions: {},
  });
  useDriveKeys(drive);

  return (
    <div data-drive={active ? 'on' : 'off'} data-clicks={clicks}>
      {open && (
        <div data-testid="case-run-area">
          <div style={{ position: 'relative', width: 640, height: 480 }}>
            <canvas width="640" height="480" onPointerDown={() => setClicks((n) => n + 1)} />
            <CodeOverlays overlays={layout.overlays} ctx={ctx} />
          </div>
          <CodeFrame panel={COCKPIT.panels[0]} ctx={ctx} pointer className="" style={{ height: 240 }} />
        </div>
      )}
    </div>
  );
}
