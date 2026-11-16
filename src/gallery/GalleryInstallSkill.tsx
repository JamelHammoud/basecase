import { useEffect, useEffectEvent } from 'react';
import { InstallSkillSheet } from '../components/InstallSkillSheet';
import { Toast } from '../design-system';
import type { SimModel } from '../sim/mjcfTypes';
import type { SkillRecord } from '../skills/skillRecords';
import { useSkillHub } from '../workspace/useSkillHub';
import { useToast } from '../workspace/useToast';
import type { GalleryTrainer } from './galleryTrainer';

export interface GalleryInstallProps {
  request: number;
  trainer: GalleryTrainer;
  buildModel: () => Promise<SimModel>;
  onInstalled: (record: SkillRecord) => void;
}

export function GalleryInstallSkill({ request, trainer, buildModel, onInstalled }: GalleryInstallProps) {
  const { toast, showToast, dismissToast } = useToast(() => {});
  const hub = useSkillHub({ skills: trainer.hubSkills(buildModel, onInstalled), showToast, openAccounts: () => {} });
  const open = useEffectEvent(() => hub.openInstall());

  useEffect(() => {
    open();
  }, [request]);

  return (
    <>
      <InstallSkillSheet
        open={hub.installOpen}
        onClose={hub.closeInstall}
        onInstall={hub.install}
        candidates={hub.candidates}
        finding={hub.finding}
      />
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Toast toast={toast} onDismiss={dismissToast} />
        </div>
      )}
    </>
  );
}
