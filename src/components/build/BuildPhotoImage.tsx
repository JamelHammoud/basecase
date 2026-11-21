import { useEffect, useEffectEvent, useState } from 'react';
import { localBuildPhotos } from '../../kit/buildPhotos';
import { PreviewImage } from '../../design-system';

export function BuildPhotoImage({
  hash,
  enlarged = false,
  onError,
}: {
  hash: string;
  enlarged?: boolean;
  onError: (error: unknown) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const failed = useEffectEvent(onError);
  const key = `${hash}:${enlarged}`;

  useEffect(() => {
    let current = true;
    let url = '';

    void localBuildPhotos
      .image(hash)
      .then((image) => {
        if (!current) return;

        url = URL.createObjectURL(enlarged ? image.original : image.thumbnail);
        setLoaded({ key, url });
      })
      .catch((error: unknown) => {
        if (current) failed(error);
      });

    return () => {
      current = false;

      if (url) URL.revokeObjectURL(url);
    };
  }, [hash, enlarged, key]);

  return <PreviewImage src={loaded?.key === key ? loaded.url : undefined} />;
}
