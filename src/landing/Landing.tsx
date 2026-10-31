import React from 'react';
import { BasecaseLogo } from '../design-system/BasecaseLogo';
import { ArrowUpRightIcon, DownloadIcon } from '../design-system/glyphs/controls';
import { PartsIcon } from '../design-system/icons';
import { BotIcon, CartIcon, PrinterIcon } from '../design-system/glyphs/files';
import { WalkIcon } from '../design-system/glyphs/tools';
import { CheckIcon, FileIcon } from '../design-system/toolIcons';
import { GITHUB_URL, MAC_DOWNLOAD, WINDOWS_DOWNLOAD } from '../utils/platform/webDemo';
import { LandingLink } from './LandingLink';
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

export const Landing: React.FC = () => (
  <div className="h-full overflow-y-auto overflow-x-hidden">
    <main className="min-h-full flex flex-col pt-[max(56px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))]">
      <header className="px-[24px] w-full max-w-[480px] mx-auto">
        <BasecaseLogo className="w-[40px] h-[40px] text-white/90" />
        <h1 className="mt-[28px] text-[34px] leading-[1.08] font-semibold tracking-[-0.025em] text-white/90">
          Build real robots
        </h1>
        <p className="mt-[14px] text-[16px] leading-[1.5] text-white/60">Basecase is a 3D CAD studio for robots.</p>
      </header>

      <div className="mt-[36px]">
        <RobotStrip />
      </div>

      <section className="mt-[36px] px-[24px] w-full max-w-[480px] mx-auto flex flex-col gap-[10px]">
        <LandingLink href={MAC_DOWNLOAD.url} variant="primary" icon={<DownloadIcon className="w-[18px] h-[18px]" />}>
          {MAC_DOWNLOAD.label}
        </LandingLink>
        <LandingLink href={WINDOWS_DOWNLOAD.url} icon={<DownloadIcon className="w-[18px] h-[18px]" />}>
          {WINDOWS_DOWNLOAD.label}
        </LandingLink>
        <LandingLink href={GITHUB_URL} external icon={<ArrowUpRightIcon className="w-[18px] h-[18px]" />}>
          View on GitHub
        </LandingLink>
      </section>

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
    </main>
  </div>
);
