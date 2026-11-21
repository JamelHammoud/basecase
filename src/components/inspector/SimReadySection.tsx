import { IS_WEB_DEMO } from '../../utils/platform/webDemo';
import type { ScenePart } from '../../types/robotics';
import { Button, Section, Spinner } from '../../design-system';
import { validSimReadyFields } from '../../simready/validation';
import { downloadSimReadyVisual, useSimReadyVisualStatus } from '../../three/simreadyVisuals';

export function SimReadySection({ part }: { part: ScenePart }) {
  const status = useSimReadyVisualStatus(part);

  if (IS_WEB_DEMO || !part.simready || !part.mesh?.visual || status === 'ready' || !validSimReadyFields(part))
    return null;

  return (
    <Section title="SimReady">
      <Button
        fullWidth
        disabled={status === 'loading'}
        icon={status === 'loading' ? <Spinner /> : undefined}
        onClick={() => void downloadSimReadyVisual(part)}
      >
        Download Textures
      </Button>
      {status === 'error' && <p className="text-[13px] text-red-400">Couldn’t download textures.</p>}
    </Section>
  );
}
