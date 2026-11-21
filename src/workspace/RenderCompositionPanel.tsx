import { Button, ColorField, FieldRow, ModeHeader, NumberInput, Spinner, Switch } from '../design-system';
import type { RenderComposition } from './useRenderComposition';
import { MAX_RENDER_PIXELS, MAX_RENDER_SIDE } from '../three/composition/settings';
import { isTextEntry } from './helpers';

export function RenderCompositionPanel({ composition }: { composition: RenderComposition }) {
  const { settings, update, busy } = composition;

  return (
    <section
      role="region"
      aria-label="Render image"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey) return;

        event.stopPropagation();

        if (event.key === 'Escape' && !isTextEntry(event.target as Element)) composition.close();
      }}
      className="glass absolute right-[12px] top-[12px] z-30 w-[340px] max-w-[calc(100%-24px)] max-h-[calc(100%-24px)] overflow-y-auto rounded-xl"
    >
      <ModeHeader title="Render image" onDone={composition.close} />
      <div className="flex flex-col gap-3 p-[12px]">
        {composition.preview && (
          <img
            src={composition.preview}
            alt="Rendered image"
            className="w-full rounded-lg object-contain max-h-[240px]"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={composition.currentView}>Use Current View</Button>
          <Button disabled={busy} onClick={() => void composition.run('frame')}>
            Frame Scene
          </Button>
        </div>
        <FieldRow label="Lighting">
          <NumberInput
            aria-label="Lighting"
            value={settings.lighting}
            min={0}
            max={4}
            step={0.1}
            unit=""
            onChange={(lighting) => update({ lighting })}
          />
        </FieldRow>
        <FieldRow label="Exposure">
          <NumberInput
            aria-label="Exposure"
            value={settings.exposure}
            min={0.1}
            max={4}
            step={0.1}
            unit=""
            onChange={(exposure) => update({ exposure })}
          />
        </FieldRow>
        <FieldRow label="Environment rotation" group>
          <NumberInput
            aria-label="Environment rotation"
            value={settings.rotation}
            min={-360}
            max={360}
            unit="°"
            onChange={(rotation) => update({ rotation })}
          />
        </FieldRow>
        <FieldRow label="Background">
          <ColorField value={settings.background} onChange={(background) => update({ background })} />
        </FieldRow>
        <Switch
          label="Transparent"
          aria-label="Transparent"
          checked={settings.transparent}
          onChange={(transparent) => update({ transparent })}
        />
        <FieldRow label="Width">
          <NumberInput
            aria-label="Width"
            value={settings.width}
            min={64}
            max={Math.min(MAX_RENDER_SIDE, Math.floor(MAX_RENDER_PIXELS / settings.height))}
            precision={0}
            unit="px"
            onChange={(width) => update({ width })}
          />
        </FieldRow>
        <FieldRow label="Height">
          <NumberInput
            aria-label="Height"
            value={settings.height}
            min={64}
            max={Math.min(MAX_RENDER_SIDE, Math.floor(MAX_RENDER_PIXELS / settings.width))}
            precision={0}
            unit="px"
            onChange={(height) => update({ height })}
          />
        </FieldRow>
        {composition.error && (
          <p role="alert" className="text-[13px] text-red-400">
            {composition.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          {busy && <Spinner className="w-4 h-4" />}
          <Button disabled={busy || !composition.valid} onClick={() => void composition.run('preview')}>
            Preview
          </Button>
          <Button
            variant="primary"
            disabled={busy || !composition.valid}
            onClick={() => void composition.run('export')}
          >
            Export PNG
          </Button>
          {busy && <Button onClick={composition.cancel}>Cancel</Button>}
        </div>
      </div>
    </section>
  );
}
