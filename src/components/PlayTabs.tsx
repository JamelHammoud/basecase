import { PanelTabs, type PanelTab } from '../design-system';
import { useRobot } from '../robot/useRobot';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { Cases } from '../workspace/useCases';
import type { Routines } from '../workspace/useRoutines';
import type { PlayTab } from './playViews';

const LiveDot = ({ title }: { title: string }) => (
  <span title={title} className="inline-block w-1.5 h-1.5 rounded-full bg-figma-blue" />
);

const live = (on: boolean, title: string) => (on ? <LiveDot title={title} /> : undefined);

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
    { value: 'cases', label: 'Cases', indicator: live(cases.attempt.phase !== 'idle', 'Trying') },
    { value: 'routines', label: 'Routines', indicator: live(!!run && !run.done, 'Running') },
    ...(IS_WEB_DEMO
      ? []
      : [{ value: 'operate' as const, label: 'Operate', indicator: live(robot.link === 'connected', 'Connected') }]),
  ];

  return <PanelTabs<PlayTab> label="Play" value={tab} onChange={onChange} tabs={tabs} />;
}
