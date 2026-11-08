import type { LeftTab } from './LeftSidebar';

export type PlayTab = Extract<LeftTab, 'cases' | 'routines' | 'operate'>;

export const isPlayTab = (tab: LeftTab): tab is PlayTab => tab === 'cases' || tab === 'routines' || tab === 'operate';
