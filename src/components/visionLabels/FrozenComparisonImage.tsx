import type { ImageAnnotation } from '../../vision/frameSet';
import LabelFrameImage from './LabelFrameImage';
import LabelOverlay from './LabelOverlay';
import type { InspectionImage } from '../tries/useVisionInspection';

interface Props {
  image: InspectionImage;
  overlay: 'candidate' | 'incumbent';
  classification: boolean;
}

export function FrozenComparisonImage({ image, overlay, classification }: Props) {
  const frame = image.set.frames[0];
  const scale = Math.max(frame.width / 600, frame.height / 400);
  const name = (annotation: ImageAnnotation) =>
    image.set.classes.find((category) => category.id === annotation.classId)?.name ?? '';
  const predicted = overlay === 'candidate' ? image.candidateClasses : image.incumbentClasses;
  const top = [...predicted].sort((a, b) => b.score - a.score)[0];

  return (
    <div className="flex flex-col gap-2">
      {!classification && (
        <div className="flex gap-3 text-[12px]">
          <span className="text-white/90">Ground truth</span>
          <span className="text-[#0d99ff]">Prediction</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role="img"
        aria-label="Frozen comparison image"
        className="w-full max-h-[400px]"
      >
        <LabelFrameImage frame={frame} />
        {!classification &&
          frame.annotations.map((annotation) => (
            <g key={annotation.instance} data-ground-truth={annotation.instance}>
              <LabelOverlay label={annotation} selected={false} name={name(annotation)} tool="select" scale={scale} />
            </g>
          ))}
        {image[overlay].map((annotation) => (
          <g key={annotation.instance} data-prediction={annotation.instance}>
            <LabelOverlay label={annotation} selected name={name(annotation)} tool="select" scale={scale} />
          </g>
        ))}
      </svg>
      {classification && (
        <dl className="grid grid-cols-2 gap-2 text-[13px] text-white/90">
          <dt>Ground truth</dt>
          <dd>{frame.annotations.map(name).join(', ')}</dd>
          <dt>Prediction</dt>
          <dd>{top?.label ?? 'No prediction'}</dd>
        </dl>
      )}
    </div>
  );
}
