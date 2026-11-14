import React, { useState } from 'react';
import { useScrollFade } from '../design-system';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { type BomLine, buildBom, bomToCsv, bomToMarkdown } from '../utils/bom';
import { useMoney } from '../utils/useMoney';
import type { PrintReport } from '../utils/printReport';
import type { Printing } from '../workspace/usePrinting';
import { isBuilt } from '../guide/guidePlan';
import type { BuildGuide } from '../workspace/useBuildGuide';
import { BuyList } from './build/BuyList';
import { CheckSheet } from './build/CheckSheet';
import { ChecksSection } from './build/ChecksSection';
import { GuideSection } from './build/GuideSection';
import { download } from './build/format';
import { PlatesSection } from './build/PlatesSection';
import type { FindingFix, ReadinessFinding } from '../readiness/types';
import { ignoreFinding, ignoreRule, restoreFinding, restoreRule } from '../readiness/readiness';
import type { ReadinessHandle } from '../workspace/useReadiness';
import { usePurchases } from './build/usePurchases';
import { sceneTether } from '../utils/powerSources';

interface BuildPanelProps {
  parts: ScenePart[];
  sceneName: string;
  project: ProjectSettings;
  onChangeProject: (patch: Partial<ProjectSettings>) => void;
  printing: Printing;
  onSelectParts: (ids: string[]) => void;
  onToast: (message: string) => void;
  onFixFinding?: (finding: ReadinessFinding) => void;
  onQuoteFinding?: (finding: ReadinessFinding) => void;
  onOpenCase?: (id: string) => void;
  onNewCase?: () => void;
  onCalibrate?: (jointIds: string[]) => void;
  onReplayFall?: (deg: number) => void;
  onMakeActuator?: (fix: Extract<FindingFix, { kind: 'make-actuator' }>) => void;
  panScroll: boolean;
  guide: BuildGuide;
  readiness: ReadinessHandle;
}

function supportByMaterial(print: PrintReport | null) {
  const out: Partial<Record<PrintMaterial, number>> = {};

  for (const r of print?.parts ?? []) out[r.material] = (out[r.material] ?? 0) + r.supportG;

  return out;
}

const fileStem = (sceneName: string) => sceneName.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'robot';

export const BuildPanel: React.FC<BuildPanelProps> = ({
  parts,
  sceneName,
  project,
  onChangeProject,
  printing,
  onSelectParts,
  onToast,
  onFixFinding,
  onQuoteFinding,
  onOpenCase,
  onNewCase,
  onCalibrate,
  onReplayFall,
  onMakeActuator,
  panScroll,
  guide,
  readiness,
}) => {
  const [purchases, savePurchase] = usePurchases();
  const { measures, report: print } = printing;
  const [checking, setChecking] = useState<BomLine | null>(null);
  const { ref: setScroller, style: fadeStyle } = useScrollFade();
  const bom = buildBom({ parts, project, purchases, measures, supportG: supportByMaterial(print) });
  const file = fileStem(sceneName);
  const money = useMoney();
  const tether = sceneTether({ parts, project });

  const exportCsv = () => {
    const names = Object.fromEntries(parts.map((p) => [p.id, p.name]));

    download(`${file}-bom.csv`, bomToCsv(bom, names, money), 'text/csv');
    onToast('Exported bill of materials');
  };
  const exportMarkdown = () => {
    download(`${file}-bom.md`, bomToMarkdown(bom, sceneName, money), 'text/markdown');
    onToast('Exported bill of materials');
  };
  const savePrice = async (line: BomLine, record: Parameters<typeof savePurchase>[1]) => {
    await savePurchase(line.key, record);
    setChecking(null);

    if (record) onToast(`Saved price for ${line.name}`);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={setScroller} style={fadeStyle} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <ChecksSection
          readiness={readiness.current}
          checking={readiness.checking}
          context={{
            parts,
            panScroll,
            actions: {
              onFix: onFixFinding,
              onApplyFix: {
                'print-face': ({ fix }) =>
                  fix?.kind === 'print-face' &&
                  printing.setPartPrint([fix.part], { down: fix.down, at: undefined, turned: undefined }),
                ...(onNewCase && { 'new-case': onNewCase }),
                ...(onCalibrate && {
                  calibrate: ({ fix, ids }: ReadinessFinding) => {
                    onSelectParts(ids);

                    if (fix?.kind === 'calibrate') onCalibrate(fix.joints);
                  },
                }),
                ...(onMakeActuator && {
                  'make-actuator': ({ fix }: ReadinessFinding) => fix?.kind === 'make-actuator' && onMakeActuator(fix),
                }),
                ...(onReplayFall && {
                  'replay-fall': ({ fix, ids }: ReadinessFinding) => {
                    onSelectParts(ids);

                    if (fix?.kind === 'replay-fall') onReplayFall(fix.deg);
                  },
                }),
              },
              onQuote: onQuoteFinding,
              onIgnore: (finding) => onChangeProject({ readiness: ignoreFinding(project.readiness, finding) }),
              onIgnoreRule: (finding) => onChangeProject({ readiness: ignoreRule(project.readiness, finding) }),
              onSelectParts,
            },
            tether: tether && { tether, onChange: (next) => onChangeProject({ tether: next }) },
            onOpenCase,
            showDots: readiness.showDots,
          }}
          restore={{
            onRestore: (finding) => onChangeProject({ readiness: restoreFinding(project.readiness, finding) }),
            onRestoreRule: (rule) => onChangeProject({ readiness: restoreRule(project.readiness, rule) }),
          }}
        />
        <BuyList
          bom={bom}
          parts={parts}
          panScroll={panScroll}
          project={project}
          onChangeProject={onChangeProject}
          onCheck={setChecking}
          onSelectParts={onSelectParts}
          onExportCsv={exportCsv}
          onExportMarkdown={exportMarkdown}
        />
        <GuideSection guide={guide} sceneName={sceneName} canGenerate={parts.some(isBuilt)} />
        <PlatesSection printing={printing} />
      </div>
      {checking && (
        <CheckSheet
          line={checking}
          onClose={() => setChecking(null)}
          onSave={(record) => savePrice(checking, record)}
        />
      )}
    </div>
  );
};
