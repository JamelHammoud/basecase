import { PanelTabs, type PanelTab } from '../design-system';
import { useRobot } from '../robot/useRobot';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { Cases } from '../workspace/useCases';
import type { Routines } from '../workspace/useRoutines';
import type { PlayTab } from './playViews';

const live = (on: boolean, label: string) => (on ? { tone: 'live' as const, label } : undefined);

interface PlayTabsProps {
  tab: PlayTab;
  onChange: (tab: PlayTab) => void;
  cases: Cases;
  routines: Routines;
}

export function PlayTabs({ tab, onChange, cases, routines }: PlayTabsProps) {
  const robot = useRobot();
  const run = routines.view.run;
  const tabs: PanelTab<PlayTab>[] = [
    { value: 'cases', label: 'Cases', status: live(cases.attempt.phase !== 'idle', 'Trying') },
    { value: 'routines', label: 'Routines', status: live(!!run && !run.done, 'Running') },
    ...(IS_WEB_DEMO
      ? []
      : [{ value: 'operate' as const, label: 'Operate', status: live(robot.link === 'connected', 'Connected') }]),
  ];

  return <PanelTabs<PlayTab> label="Play" value={tab} onChange={onChange} tabs={tabs} />;
}
