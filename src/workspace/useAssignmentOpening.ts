import { useEffect, useEffectEvent, useRef } from 'react';
import { caseCheckId } from '../readiness/caseChecks';
import type { WorkspaceCore } from './useWorkspaceCore';

function assignmentCheckElement(name: string, caseId?: string) {
  return [...document.querySelectorAll<HTMLElement>('[data-check], [id^="case-check-"]')].find(
    (element) =>
      !element.closest('[inert]') && (element.dataset.check === name || (caseId && element.id === caseCheckId(caseId))),
  );
}

export function useAssignmentOpening(core: WorkspaceCore, active: boolean) {
  const context = core.project.assignment;
  const readiness = core.readiness.current;
  const opened = useRef<string | null>(null);
  const focused = useRef(false);
  const open = useEffectEvent(() => {
    if (opened.current === core.scene.sceneId || !context) return;

    opened.current = core.scene.sceneId;
    focused.current = false;
    core.simTraining.cases.open(context.assignment.bundle.case.id);

    if (!context.inspection) return;

    core.tool.setRightTab('build');
    core.studio.setIsRightOpen(true);
    core.setSelectedIds(context.inspection.ids);
  });
  const focus = useEffectEvent(() => {
    if (focused.current || !context?.inspection) return;

    const check = readiness?.checks.find((item) => item.name === context.inspection?.check);
    const row = check && assignmentCheckElement(check.name, check.caseId);

    if (!row) return;

    focused.current = true;
    row.scrollIntoView({ block: 'center' });

    const button = row.matches('button') ? row : row.querySelector('button');

    button?.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (active && context) open();
  }, [active, context, core.scene.sceneId]);
  useEffect(() => {
    if (active && core.tool.rightTab === 'build') focus();
  }, [active, context, readiness, core.tool.rightTab]);
}
