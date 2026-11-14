import { useRef, useState } from 'react';
import { hubBridge } from '../hub/hubBridge';
import { installPlan, publishedSkillFiles, readPublishedSkill, skillLink, skillRepoName } from '../skills/hubSkill';
import { KIT_LABELS, type SkillRow } from '../skills/skillRows';
import { errorMessage } from '../utils/errorMessage';
import { openLink } from '../utils/openLink';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { ShowToast } from './types';
import type { SceneSkills } from './useSkills';

interface SkillHubOptions {
  skills: SceneSkills;
  showToast: ShowToast;
  openAccounts: () => void;
}

export interface SkillHub {
  publishable: SkillRow[];
  canInstall: boolean;
  installOpen: boolean;
  openInstall: () => void;
  closeInstall: () => void;
  publish: (row: SkillRow) => void;
  install: (link: string) => void;
}

const canPublish = (row: SkillRow) => !IS_WEB_DEMO && row.state.kind === 'ready' && !!row.record;

async function publishRow(skills: SceneSkills, row: SkillRow) {
  const skill = row.record ? await skills.loadSkill(row.record) : null;
  const environment = skills.environmentOf(row);
  const model = skills.model;

  if (!skill || !environment || !model) throw new Error('This skill isn’t saved on this computer.');

  const files = publishedSkillFiles({ skill, environment, model });

  return hubBridge.publish({ name: skillRepoName(skill, model), files, kind: 'model' });
}

async function installFrom(skills: SceneSkills, link: string) {
  const { repo, files } = await hubBridge.skillFiles(skillLink(link));
  const published = readPublishedSkill(files);
  const model = await skills.buildModel();
  const plan = installPlan(published, model);
  const busy = skills.install(model, plan);

  if (busy) throw new Error(busy);

  return `Training ${KIT_LABELS[plan.entry]} from ${repo}`;
}

export function useSkillHub({ skills, showToast, openAccounts }: SkillHubOptions): SkillHub {
  const [installOpen, setInstallOpen] = useState(false);
  const busy = useRef(false);

  const once = async (work: () => Promise<void>) => {
    if (busy.current) return;

    busy.current = true;

    try {
      await work();
    } finally {
      busy.current = false;
    }
  };

  const publish = async (row: SkillRow) => {
    if (!(await hubBridge.signedIn())) return openAccounts();

    showToast('Publishing skill…', { tone: 'progress' });

    try {
      const published = await publishRow(skills, row);

      showToast(`Published to ${published.repo}`, {
        action: { label: 'Open', onClick: () => openLink(published.url) },
      });
    } catch (err) {
      showToast(`Couldn’t publish the skill. ${errorMessage(err)}`, { tone: 'error' });
    }
  };

  const install = async (link: string) => {
    showToast('Installing skill…', { tone: 'progress' });

    try {
      showToast(await installFrom(skills, link), { tone: 'neutral' });
    } catch (err) {
      showToast(`Couldn’t install the skill. ${errorMessage(err)}`, { tone: 'error' });
    }
  };

  return {
    publishable: skills.rows.filter(canPublish),
    canInstall: !IS_WEB_DEMO && skills.available && !skills.busy,
    installOpen,
    openInstall: () => setInstallOpen(true),
    closeInstall: () => setInstallOpen(false),
    publish: (row) => {
      if (canPublish(row)) void once(() => publish(row));
    },
    install: (link) => void once(() => install(link)),
  };
}
