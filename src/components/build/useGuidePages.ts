import { useEffect, useState } from 'react';
import { guidePagesKey, prefetchGuidePages, type GuidePages } from '../../guide/viewer/guidePages';
import type { BuildGuideRecord } from '../../types/robotics';

interface Loaded {
  key: string;
  guide: GuidePages | null;
}

export function useGuidePages(record: BuildGuideRecord | undefined): GuidePages | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const id = record?.id;
  const generatedAt = record?.generatedAt;
  const key = id && generatedAt ? guidePagesKey(id, generatedAt) : null;

  useEffect(() => {
    if (!id || !generatedAt) return undefined;

    const key = guidePagesKey(id, generatedAt);

    return prefetchGuidePages(id, generatedAt, (guide) => setLoaded({ key, guide }));
  }, [id, generatedAt]);

  return loaded && loaded.key === key ? loaded.guide : null;
}
