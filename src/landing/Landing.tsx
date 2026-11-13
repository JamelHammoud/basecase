import React from 'react';
import { BasecaseLogo } from '../design-system/BasecaseLogo';
import { PartsIcon } from '../design-system/icons';
import { BotIcon, CartIcon, PrinterIcon } from '../design-system/glyphs/files';
import { WalkIcon } from '../design-system/glyphs/tools';
import { CheckIcon, FileIcon } from '../design-system/toolIcons';
import { LandingActions } from './LandingActions';
import type { Section } from './pages/sections';
import { SectionLinks } from './pages/SectionLinks';
import { RobotStrip } from './RobotStrip';

const FEATURES = [
  { Icon: BotIcon, title: 'Agent', text: 'Design entire robots or components using AI' },
  { Icon: PartsIcon, title: 'Real parts', text: 'Use real purchasable parts in your build' },
  { Icon: CheckIcon, title: 'Checks', text: 'Check servo torque, stability and more' },
  { Icon: WalkIcon, title: 'Simulation', text: 'Test your robot in sim, and train it to do new tasks' },
  { Icon: CartIcon, title: 'Cost', text: 'Create a budget and track costs as you design' },
  { Icon: PrinterIcon, title: 'Printing', text: 'Slice parts and send them directly to the printer' },
  { Icon: FileIcon, title: 'Build guide', text: 'Auto-generate printable build instructions' },
];

export interface LandingProps {
  browserApp?: string;
  sections?: Section[];
}

export const Landing: React.FC<LandingProps> = ({ browserApp, sections }) => (
  <main className="min-h-dvh overflow-x-hidden flex flex-col pt-[max(56px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))] sm:pt-[96px] sm:pb-[72px]">
    <header className="px-[24px] w-full max-w-[480px] mx-auto">
      <BasecaseLogo className="w-[40px] h-[40px] text-white/90" />
      <h1 className="mt-[28px] text-[34px] sm:text-[44px] leading-[1.08] font-semibold tracking-[-0.025em] text-white/90">
        Build real robots
      </h1>
      <p className="mt-[14px] text-[16px] leading-[1.5] text-white/60">Basecase is a 3D CAD studio for robots.</p>
    </header>

    <div className="mt-[36px] sm:mt-[48px]">
      <RobotStrip />
    </div>

    <LandingActions browserApp={browserApp} />

    <ul className="mt-[44px] px-[24px] w-full max-w-[480px] mx-auto list-none flex flex-col gap-[22px]">
      {FEATURES.map(({ Icon, title, text }) => (
        <li key={title} className="flex gap-[14px]">
          <span className="w-[36px] h-[36px] shrink-0 rounded-[10px] bg-white/[0.06] flex items-center justify-center text-white/70">
            <Icon className="w-[18px] h-[18px]" />
          </span>
          <div className="flex flex-col pt-[1px]">
            <h2 className="text-[15px] leading-[1.3] font-semibold text-white/90">{title}</h2>
            <p className="text-[14px] leading-[1.45] text-white/60">{text}</p>
          </div>
        </li>
      ))}
    </ul>

    {sections && (
      <footer className="mt-[44px] px-[24px] w-full max-w-[480px] mx-auto">
        <SectionLinks sections={sections} />
      </footer>
    )}
  </main>
);
